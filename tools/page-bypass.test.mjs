import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(toolsDir, '../src/page-bypass.ts');
const { outputFiles } = await build({
  entryPoints: [sourcePath],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
});
const compiledSource = outputFiles[0].text;

function createEnvironment({ fetchHandler, hasBeacon = true } = {}) {
  const nativeFetchCalls = [];
  const nativeXhrOpens = [];
  const nativeXhrSends = [];
  const nativeBeaconCalls = [];
  const logs = [];

  class FakeEvent {
    constructor(type) {
      this.type = type;
    }
  }

  class FakeProgressEvent extends FakeEvent {}

  class FakeEventTarget {
    constructor() {
      this.listeners = new Map();
    }

    addEventListener(type, callback, options = {}) {
      const callbacks = this.listeners.get(type) ?? [];
      callbacks.push({ callback, once: Boolean(options?.once) });
      this.listeners.set(type, callbacks);
    }

    removeEventListener(type, callback) {
      const callbacks = this.listeners.get(type) ?? [];
      this.listeners.set(
        type,
        callbacks.filter((entry) => entry.callback !== callback),
      );
    }

    dispatchEvent(event) {
      const callbacks = [...(this.listeners.get(event.type) ?? [])];
      for (const entry of callbacks) {
        entry.callback.call(this, event);
        if (entry.once) this.removeEventListener(event.type, entry.callback);
      }
      return true;
    }
  }

  class FakeXMLHttpRequest extends FakeEventTarget {
    constructor() {
      super();
      this.readyState = 0;
      this.status = 0;
      this.statusText = '';
      this.responseText = '';
      this.response = '';
      this.responseURL = '';
      this.method = '';
      this.url = '';
    }

    open(method, url, ...rest) {
      this.method = method;
      this.url = typeof url === 'string' ? url : url.href;
      this.readyState = 1;
      nativeXhrOpens.push({ method, url: this.url, rest });
    }

    send(body = null) {
      nativeXhrSends.push({ method: this.method, url: this.url, body });
      this.readyState = 4;
      this.status = 200;
      this.statusText = 'OK';
      this.responseText = 'native';
      this.response = 'native';
      this.responseURL = this.url;
      setTimeout(() => {
        this.dispatchEvent(new FakeEvent('readystatechange'));
        this.dispatchEvent(new FakeProgressEvent('load'));
        this.dispatchEvent(new FakeProgressEvent('loadend'));
      }, 0);
    }
  }

  const navigator = {};
  if (hasBeacon) {
    navigator.sendBeacon = (...args) => {
      nativeBeaconCalls.push(args);
      return false;
    };
  }

  const nativeFetch = async (input, init) => {
    nativeFetchCalls.push({ input, init });
    return fetchHandler ? fetchHandler(input, init) : new Response('native');
  };

  const context = vm.createContext({
    clearTimeout,
    console: { log: (...args) => logs.push(args) },
    document: {
      readyState: 'loading',
      addEventListener() {},
    },
    Event: FakeEvent,
    EventTarget: FakeEventTarget,
    Headers: globalThis.Headers,
    location: { href: 'https://www.m6.fr/m6/direct' },
    navigator,
    ProgressEvent: FakeProgressEvent,
    Request: globalThis.Request,
    Response: globalThis.Response,
    setTimeout,
    URL: globalThis.URL,
    XMLHttpRequest: FakeXMLHttpRequest,
  });
  context.window = context;
  context.fetch = nativeFetch;
  vm.runInContext(compiledSource, context, { filename: 'page-bypass.ts' });

  return {
    context,
    logs,
    nativeBeaconCalls,
    nativeFetchCalls,
    nativeXhrOpens,
    nativeXhrSends,
    navigator,
  };
}

function parseJson(environment, text, reviver) {
  environment.context.__m6TestJson = text;
  environment.context.__m6TestReviver = reviver;
  try {
    return vm.runInContext('JSON.parse(__m6TestJson, __m6TestReviver)', environment.context);
  } finally {
    delete environment.context.__m6TestJson;
    delete environment.context.__m6TestReviver;
  }
}

function responseWithUrl(body, init, url) {
  const response = new Response(body, init);
  Object.defineProperty(response, 'url', { configurable: true, value: url });
  return response;
}

function sendXhr(environment, url) {
  const xhr = new environment.context.XMLHttpRequest();
  const events = [];
  for (const type of ['readystatechange', 'load', 'loadend']) {
    xhr.addEventListener(type, () => events.push(type));
  }
  const completed = new Promise((resolve) => {
    xhr.addEventListener('loadend', resolve, { once: true });
  });
  xhr.open('GET', url);
  xhr.send();
  return completed.then(() => ({ xhr, events }));
}

test('JSON.parse désactive la pub absente ou activée sans modifier les options', () => {
  const environment = createEnvironment();
  const configurations = [
    {
      applaunch: {
        player: {
          features: {
            ad: {
              dai: { enabled: true, provider: 'dai-provider' },
              providers: ['provider-a', 'provider-b'],
              options: { skip: false, timeout: 12 },
            },
          },
        },
      },
    },
    {
      applaunch: {
        player: {
          features: {
            ad: {
              enabled: true,
              dai: { enabled: true, provider: 'dai-provider' },
              providers: ['provider-a', 'provider-b'],
              options: { skip: false, timeout: 12 },
            },
          },
        },
      },
    },
  ];

  for (const configuration of configurations) {
    const parsed = parseJson(environment, JSON.stringify(configuration));
    const ad = parsed.applaunch.player.features.ad;
    assert.equal(ad.enabled, false);
    assert.equal(ad.dai.enabled, false);
    assert.deepEqual(Array.from(ad.providers), ['provider-a', 'provider-b']);
    assert.deepEqual(JSON.parse(JSON.stringify(ad.options)), { skip: false, timeout: 12 });
    assert.equal(ad.dai.provider, 'dai-provider');
  }
  assert.equal(environment.context.window.__m6antipub.configsNettoyees, 2);
});

test('fetch nettoie une seule fois et conserve le corps, les métadonnées et l’URL', async () => {
  const config = {
    applaunch: {
      player: {
        features: { ad: { enabled: true, dai: { enabled: true }, providers: ['main'] } },
      },
    },
  };
  const sourceUrl = 'https://api.m6.fr/applaunch/config';
  const sourceResponse = responseWithUrl(JSON.stringify(config), {
    status: 201,
    statusText: 'Created',
    headers: {
      'cache-control': 'no-store',
      'content-encoding': 'gzip',
      'content-length': '9876',
      'content-type': 'application/json; charset=utf-8',
      'x-m6-config': 'player',
    },
  }, sourceUrl);
  const environment = createEnvironment({ fetchHandler: () => sourceResponse });

  const response = await environment.context.fetch(sourceUrl);
  const clone = response.clone();
  const [json, cloneJson] = await Promise.all([response.json(), clone.json()]);

  for (const body of [json, cloneJson]) {
    assert.equal(body.applaunch.player.features.ad.enabled, false);
    assert.equal(body.applaunch.player.features.ad.dai.enabled, false);
    assert.deepEqual(body.applaunch.player.features.ad.providers, ['main']);
  }
  assert.equal(response.status, 201);
  assert.equal(response.statusText, 'Created');
  assert.equal(response.url, sourceUrl);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('x-m6-config'), 'player');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.has('content-length'), false);
  assert.equal(response.headers.has('content-encoding'), false);
  assert.equal(environment.nativeFetchCalls.length, 1);
  assert.equal(environment.context.window.__m6antipub.configsNettoyees, 1);
});

test('fetch laisse intactes les réponses JSON sans publicité et les réponses non-JSON', async () => {
  const jsonResponse = new Response(JSON.stringify({ player: { features: { video: true } } }), {
    headers: { 'content-type': 'application/json' },
  });
  const textResponse = new Response('contenu texte', {
    headers: { 'content-type': 'text/plain' },
  });
  const environment = createEnvironment({
    fetchHandler: (input) => (input === 'https://api.m6.fr/player' ? jsonResponse : textResponse),
  });

  assert.strictEqual(await environment.context.fetch('https://api.m6.fr/player'), jsonResponse);
  assert.strictEqual(await environment.context.fetch('https://cdn.m6.fr/notice'), textResponse);
  assert.equal(environment.context.window.__m6antipub.configsNettoyees, 0);
  assert.equal(environment.nativeFetchCalls.length, 2);
});

test('le diagnostic affiche les interrupteurs après nettoyage, pas leurs anciennes valeurs', () => {
  const environment = createEnvironment();
  parseJson(environment, JSON.stringify({
    featureFlipping: { ad: true, player: { dai: true } },
    features: { antiBlocker: { ADS: true } },
  }));

  for (const path of ['featureFlipping.ad', 'featureFlipping.player.dai', 'features.antiBlocker.ADS']) {
    const entry = environment.logs.find((args) => args.includes(path));
    assert.ok(entry, path);
    assert.equal(entry.at(-1), false, path);
  }
});

test('featureFlipping devient faux sans remplacer les objets ou fonctions du player', () => {
  const environment = createEnvironment();
  let featureFlippingRef;
  let playerRef;
  let adsRef;
  let chromecastRef;
  const source = JSON.stringify({
    featureFlipping: {
      ad: true,
      player: {
        ads: {
          autoplay: true,
          chromecast: { ads: true, enabled: true },
          enabled: true,
          label: 'conserver',
        },
        dai: true,
        chromecast: { enabled: true, ads: { audio: true, live: true, video: true } },
        otherFeature: true,
      },
    },
  });
  const parsed = parseJson(environment, source, function (key, value) {
    if (key === 'ads' && typeof value?.autoplay === 'boolean') adsRef = value;
    if (key === 'chromecast' && typeof value?.ads === 'boolean') chromecastRef = value;
    if (key === 'player') {
      playerRef = value;
      value.keepPlayerMethod = () => 'preserved';
    }
    if (key === 'featureFlipping') featureFlippingRef = value;
    return value;
  });

  const featureFlipping = parsed.featureFlipping;
  const player = featureFlipping.player;
  assert.equal(featureFlipping.ad, false);
  assert.equal(player.dai, false);
  assert.equal(player.ads.enabled, false);
  assert.equal(player.ads.autoplay, false);
  assert.equal(player.ads.chromecast.ads, false);
  assert.equal(player.ads.chromecast.enabled, false);
  assert.equal(player.ads.label, 'conserver');
  assert.equal(player.chromecast.enabled, true);
  assert.equal(player.chromecast.ads.audio, false);
  assert.equal(player.chromecast.ads.live, false);
  assert.equal(player.chromecast.ads.video, false);
  assert.equal(player.otherFeature, true);
  assert.strictEqual(featureFlipping, featureFlippingRef);
  assert.strictEqual(player, playerRef);
  assert.strictEqual(player.ads, adsRef);
  assert.strictEqual(player.ads.chromecast, chromecastRef);
  assert.equal(player.keepPlayerMethod(), 'preserved');
  assert.equal(environment.context.window.__m6antipub.configsNettoyees, 1);
});

test('featureFlipping conserve les contrôles DRM même dans une branche publicitaire', () => {
  const environment = createEnvironment();
  const parsed = parseJson(environment, JSON.stringify({
    featureFlipping: {
      dai: {
        enabled: true,
        DRM: true,
        drm: { enabled: true },
        widevine: { enabled: true },
        playready: true,
        fairplay: true,
        robustness: true,
        license: { enabled: true },
      },
      player: { ads: { jingle: true, useDrm: true, keySystem: { enabled: true } } },
    },
  }));

  const { dai, player } = parsed.featureFlipping;
  assert.equal(dai.enabled, false);
  for (const key of ['DRM', 'playready', 'fairplay', 'robustness']) assert.equal(dai[key], true, key);
  for (const key of ['drm', 'widevine', 'license']) assert.equal(dai[key].enabled, true, key);
  assert.equal(player.ads.jingle, false);
  assert.equal(player.ads.useDrm, true);
  assert.equal(player.ads.keySystem.enabled, true);
});

test('features.antiBlocker.ADS est désactivé sans toucher au DRM ni aux providers', () => {
  const environment = createEnvironment();
  const parsed = parseJson(environment, JSON.stringify({
    features: { antiBlocker: { ADS: true, DRM: true, analytics: true } },
    tubePlayer: { antiBlocker: { blockedProvider: { ADS: 0, DRM: 1 } } },
  }));

  assert.equal(parsed.features.antiBlocker.ADS, false);
  assert.equal(parsed.features.antiBlocker.DRM, true);
  assert.equal(parsed.features.antiBlocker.analytics, true);
  assert.equal(parsed.tubePlayer.antiBlocker.blockedProvider.ADS, 0);
  assert.equal(parsed.tubePlayer.antiBlocker.blockedProvider.DRM, 1);
  assert.equal(environment.context.window.__m6antipub.configsNettoyees, 1);
});

test('les libellés Audio Description restent inchangés et ne sont pas journalisés comme pub', () => {
  const environment = createEnvironment();
  const parsed = parseJson(environment, JSON.stringify({
    player: { tracks: { tooltip: { ad: 'Audio Description' } } },
    translations: { fr: { player: { ad: 'Audio Description' } } },
    features: { ad: { enabled: true, dai: { enabled: true } } },
  }));
  const keys = environment.context.window.__m6antipub.clesPubDecouvertes;

  assert.equal(parsed.player.tracks.tooltip.ad, 'Audio Description');
  assert.equal(parsed.translations.fr.player.ad, 'Audio Description');
  assert.equal(keys.includes('player.tracks.tooltip.ad'), false);
  assert.equal(keys.includes('translations.fr.player.ad'), false);
  assert.equal(environment.context.window.__m6antipub.configsNettoyees, 1);
});

test('fetch neutralise FreeWheel, Tealium et les chemins publicitaires sans réseau natif', async () => {
  const environment = createEnvironment();
  const urls = [
    'https://fwmrm.net/request',
    'https://ads.fwmrm.net/request',
    'https://collect.tealiumiq.com/v1/event',
    'https://cdn.m6.fr/ad/g/1?slot=1',
    'https://cdn.m6.fr/vast',
    'https://cdn.m6.fr/vmap',
  ];

  for (const url of urls) {
    const response = await environment.context.fetch(url);
    assert.equal(response.status, 200, url);
    assert.equal(await response.text(), '', url);
  }
  assert.equal(environment.nativeFetchCalls.length, 0);
  assert.equal(environment.context.window.__m6antipub.requetesPubNeutralisees, urls.length);
});

test('fetch neutralise une URL même lorsque son prototype échoue au test instanceof', async () => {
  const environment = createEnvironment();
  const input = new URL('https://fwmrm.net/request');
  Object.setPrototypeOf(input, Object.create(null, Object.getOwnPropertyDescriptors(URL.prototype)));
  assert.equal(input instanceof URL, false);
  assert.equal(String(input), 'https://fwmrm.net/request');

  const response = await environment.context.fetch(input);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
  assert.equal(environment.nativeFetchCalls.length, 0);
});

test('XHR neutralise FreeWheel, Tealium et les chemins publicitaires avec ses événements', async () => {
  const environment = createEnvironment();
  const urls = [
    'https://fwmrm.net/request',
    'https://adserver.fwmrm.net/request',
    'https://collect.tealiumiq.com/v1/event',
    'https://cdn.m6.fr/ad/g/1?slot=1',
    'https://cdn.m6.fr/vast',
    'https://cdn.m6.fr/vmap',
  ];

  for (const url of urls) {
    const { xhr, events } = await sendXhr(environment, url);
    assert.equal(xhr.readyState, 4, url);
    assert.equal(xhr.status, 200, url);
    assert.equal(xhr.statusText, 'OK', url);
    assert.equal(xhr.responseText, '', url);
    assert.equal(xhr.response, '', url);
    assert.deepEqual(events, ['readystatechange', 'load', 'loadend']);
  }
  assert.equal(environment.nativeXhrSends.length, 0);
  assert.equal(environment.context.window.__m6antipub.requetesPubNeutralisees, urls.length);
});

test('les domaines ressemblants et les chemins publicitaires en query string passent normalement', async () => {
  const environment = createEnvironment({ fetchHandler: () => new Response('normal') });
  const urls = [
    'https://evilfwmrm.net/player',
    'https://www.m6.fr/api/player?campaign=/vast&next=/ad/g/1',
  ];

  for (const url of urls) {
    const response = await environment.context.fetch(url);
    assert.equal(await response.text(), 'normal');
  }
  assert.deepEqual(
    environment.nativeFetchCalls.map(({ input }) => input),
    urls,
  );
  assert.equal(environment.nativeXhrSends.length, 0);

  for (const url of urls) {
    const { xhr } = await sendXhr(environment, url);
    assert.equal(xhr.status, 200);
    assert.equal(xhr.responseText, 'native');
  }
  assert.deepEqual(
    environment.nativeXhrSends.map(({ url }) => url),
    urls,
  );
  assert.equal(environment.context.window.__m6antipub.requetesPubNeutralisees, 0);
});

test('sendBeacon neutralise Tealium localement et tolère son absence', () => {
  const environment = createEnvironment();

  assert.equal(
    environment.navigator.sendBeacon('https://collect.tealiumiq.com/v1/event', 'payload'),
    true,
  );
  assert.equal(environment.nativeBeaconCalls.length, 0);

  const withoutBeacon = createEnvironment({ hasBeacon: false });
  assert.equal('sendBeacon' in withoutBeacon.navigator, false);
  assert.equal(withoutBeacon.context.window.__m6antipub.actif, true);
});

test('XHR synchrone neutralisé termine avant le retour de send', () => {
  const environment = createEnvironment();
  const xhr = new environment.context.XMLHttpRequest();
  const events = [];
  for (const type of ['readystatechange', 'load', 'loadend']) {
    xhr.addEventListener(type, () => events.push(type));
  }

  xhr.open('POST', 'https://collect.tealiumiq.com/event', false);
  xhr.send('diagnostic');

  assert.equal(xhr.status, 200);
  assert.equal(xhr.responseText, '');
  assert.deepEqual(events, ['readystatechange', 'load', 'loadend']);
  assert.equal(environment.nativeXhrSends.length, 0);
});

test('XHR réutilisé retrouve sa réponse native sans événements de la requête neutralisée', async () => {
  const environment = createEnvironment();
  const xhr = new environment.context.XMLHttpRequest();
  const events = [];
  for (const type of ['readystatechange', 'load', 'loadend']) {
    xhr.addEventListener(type, () => events.push(type));
  }
  const completed = new Promise((resolve) => xhr.addEventListener('loadend', resolve, { once: true }));

  xhr.open('POST', 'https://collect.tealiumiq.com/event');
  xhr.send('diagnostic');
  xhr.open('GET', 'https://www.m6.fr/api/player');
  xhr.send();
  await completed;

  assert.equal(xhr.responseText, 'native');
  assert.equal(xhr.responseURL, 'https://www.m6.fr/api/player');
  assert.equal(environment.nativeXhrSends.length, 1);
  assert.deepEqual(events, ['readystatechange', 'load', 'loadend']);
});

test('sendBeacon non publicitaire conserve les arguments et le résultat natif', () => {
  const environment = createEnvironment();
  const url = new URL('https://www.m6.fr/api/player');
  const body = new Blob(['diagnostic']);

  assert.equal(environment.navigator.sendBeacon(url, body), false);
  assert.equal(environment.nativeBeaconCalls.length, 1);
  assert.strictEqual(environment.nativeBeaconCalls[0][0], url);
  assert.strictEqual(environment.nativeBeaconCalls[0][1], body);
  assert.equal(environment.context.window.__m6antipub.requetesPubNeutralisees, 0);
});

test('JSON.parse conserve le SyntaxError pour un JSON invalide', () => {
  const environment = createEnvironment();

  assert.throws(
    () => parseJson(environment, '{invalid'),
    (error) => error?.name === 'SyntaxError',
  );
  assert.equal(environment.context.window.__m6antipub.configsVues, 0);
});
