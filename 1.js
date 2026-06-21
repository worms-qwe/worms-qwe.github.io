(function () {
  'use strict';

  if (window.__jellyfinPlugin_loaded) return;
  window.__jellyfinPlugin_loaded = true;

  var STORAGE_PREFIX = 'jellyfin';
  var SETTINGS_COMPONENT = STORAGE_PREFIX;
  var PANEL_COMPONENT = STORAGE_PREFIX + 'Panel';
  var HUB_COMPONENT = STORAGE_PREFIX + 'Hub';
  var HUB_PREVIEW_LIMIT = 12;

  var DEFAULT_URL = '';
  var DEFAULT_API_KEY = '';

  var HTTP_TIMEOUT_MS = 15000;
  var TMDB_TIMEOUT_MS = 10000;
  var TMDB_ENRICH_CONCURRENCY = 8;
  var PAGE_SIZE = 48;
  var IMG_PLACEHOLDER = './img/img_load.svg';
  var LIBRARY_INDEX_TTL_MS = 5 * 60 * 1000;

  var RELEASE_FOLDER_RE =
    /(Season\s*\d+)|(S\d{1,2}\s*E\d{0,2}\s*WEB)|WEB-DL|WEBRip|BluRay|2160p|1080p|720p|HDR10|HDR\b|\bDV\b|NOIR\s+VER|COLOR\s+VER|x265|x264/i;

  var MANIFEST = {
    type: 'video',
    version: '1.3.0',
    author: '@pavelpikta',
    name: 'Jellyfin',
    description: 'Browse and play your Jellyfin library in Lampa',
    component: SETTINGS_COMPONENT,
    icon:
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>',
  };

  var FULLSTART_BTN_ICON =
    '<svg class="jellyfin-fullstart__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>';

  var HEAD_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>';

  var cachedUserId = '';
  var cachedAutoUserName = '';
  var libraryIndex = { byTmdb: {}, loadedAt: 0 };
  var tmdbMetaCache = {};
  var tmdbPosterInflight = {};

  // --- Глобальные переменные для текущей сессии воспроизведения ---
  var currentItemId = null;
  var currentUserId = null;
  var currentPlaySessionId = null;
  var currentMediaSourceId = null;
  var currentMediaStreams = [];
  var currentAudioIndex = null;
  var currentSubtitleIndex = null;

  // --- Параметры транскодирования (фиксированное качество – HLS с адаптивным битрейтом) ---
  var TRANSCODE_QUALITY = {
    maxWidth: 1920,
    videoBitrate: 20000000,
    maxStreamingBitrate: 80000000,
    audioBitrate: 384000,
    h264Level: '51'
  };

  // --- Вспомогательные функции ---
  function addLang() {
    Lampa.Lang.add({
      jellyfin_title: { en: 'Jellyfin', ru: 'Jellyfin' },
      jellyfin_movies: { en: 'Movies', ru: 'Фильмы' },
      jellyfin_series: { en: 'TV Series', ru: 'Сериалы' },
      jellyfin_resume: { en: 'Continue watching', ru: 'Продолжить просмотр' },
      jellyfin_latest: { en: 'Latest added', ru: 'Недавно добавлено' },
      jellyfin_stat_resume: { en: 'Continue', ru: 'Продолжить' },
      jellyfin_stat_latest: { en: 'Latest', ru: 'Недавние' },
      jellyfin_stat_movies: { en: 'Movies', ru: 'Фильмы' },
      jellyfin_stat_series: { en: 'Series', ru: 'Сериалы' },
      jellyfin_play: { en: 'Play', ru: 'Смотреть' },
      jellyfin_open_card: { en: 'Open card', ru: 'Открыть карточку' },
      jellyfin_episodes: { en: 'Episodes', ru: 'Эпизоды' },
      jellyfin_pick_episode: { en: 'Choose episode', ru: 'Выберите эпизод' },
      jellyfin_empty: { en: 'Library is empty', ru: 'Библиотека пуста' },
      jellyfin_empty_descr: {
        en: 'Add media to Jellyfin or check connection settings',
        ru: 'Добавьте медиа в Jellyfin или проверьте настройки подключения',
      },
      jellyfin_retry: { en: 'Retry', ru: 'Повторить' },
      jellyfin_open_settings: { en: 'Open settings', ru: 'Открыть настройки' },
      jellyfin_auth_ok: { en: 'Connection OK', ru: 'Подключение успешно' },
      jellyfin_auth_fail: { en: 'Connection failed', ru: 'Не удалось подключиться' },
      jellyfin_test: { en: 'Test connection', ru: 'Проверить подключение' },
      jellyfin_url: { en: 'Server URL', ru: 'URL сервера' },
      jellyfin_key: { en: 'API key', ru: 'API-ключ' },
      jellyfin_no_tmdb: {
        en: 'No TMDB id on this item',
        ru: 'Нет TMDB id у этого элемента',
      },
      jellyfin_error: { en: 'Something went wrong', ru: 'Что-то пошло не так' },
      jellyfin_settings_name: { en: 'Jellyfin', ru: 'Jellyfin' },
      jellyfin_settings_hint: {
        en: 'Jellyfin URL and API key from Dashboard → API Keys',
        ru: 'URL Jellyfin и API-ключ из Панель → Ключи API',
      },
      jellyfin_set_dedupe: {
        en: 'Merge duplicates (TMDB)',
        ru: 'Объединять дубликаты (TMDB)',
      },
      jellyfin_set_hide_folders: {
        en: 'Hide release folders',
        ru: 'Скрывать папки релизов',
      },
      jellyfin_set_tmdb_posters: {
        en: 'TMDB posters & titles',
        ru: 'Постеры и названия из TMDB',
      },
      jellyfin_set_full_button: {
        en: 'Play button on Lampa card',
        ru: 'Кнопка воспроизведения на карточке',
      },
      jellyfin_more: { en: 'More', ru: 'Ещё' },
      jellyfin_libraries: { en: 'Library', ru: 'Библиотека' },
      jellyfin_set_tap_play: {
        en: 'Tap card to play (long = menu)',
        ru: 'Нажатие — смотреть (долгое — меню)',
      },
      jellyfin_set_stream_hint: {
        en: 'Lampa player: HLS transcode (quality in player). External player: direct stream.',
        ru: 'Плеер Lampa: HLS-транскодинг (качество в плеере). Внешний плеер: прямой поток.',
      },
      jellyfin_play_from_library: {
        en: 'Play from Jellyfin',
        ru: 'Смотреть из Jellyfin',
      },
      jellyfin_watched: { en: 'Watched', ru: 'Просмотрено' },
      jellyfin_mark_watched: { en: 'Mark as watched', ru: 'Отметить просмотренным' },
      jellyfin_mark_unwatched: { en: 'Mark as unwatched', ru: 'Снять отметку просмотра' },
      jellyfin_mark_watched_ok: { en: 'Marked as watched', ru: 'Отмечено как просмотрено' },
      jellyfin_mark_unwatched_ok: { en: 'Marked as unwatched', ru: 'Снята отметка просмотра' },
      jellyfin_season_n: { en: 'Season {0}', ru: 'Сезон {0}' },
      jellyfin_user: { en: 'Jellyfin user', ru: 'Пользователь Jellyfin' },
      jellyfin_user_pick: { en: 'Choose user', ru: 'Выбрать пользователя' },
      jellyfin_user_auto: { en: 'First user (auto)', ru: 'Первый пользователь (авто)' },
    });
  }

  function storageStr(suffix, fallback) {
    try {
      var v =
        String(Lampa.Storage.get(STORAGE_PREFIX + suffix) || '').trim() ||
        String(Lampa.Storage.field(STORAGE_PREFIX + suffix) || '').trim();
      if (v) return v;
    } catch (e) { }
    return fallback == null ? '' : String(fallback);
  }

  function storageToggle(suffix, defaultOn) {
    try {
      var v = Lampa.Storage.field(STORAGE_PREFIX + suffix);
      if (v === true) return true;
      if (v === false) return false;
    } catch (e) { }
    return defaultOn !== false;
  }

  function normalizeBase(raw) {
    var s = String(raw || '').trim().replace(/\/+$/, '');
    if (!s.length) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    return s;
  }

  function apiBase() {
    return normalizeBase(storageStr('Url', DEFAULT_URL));
  }

  function apiKey() {
    return storageStr('Key', DEFAULT_API_KEY);
  }

  var netInstance = null;
  function network() {
    if (!netInstance && Lampa.Reguest) netInstance = new Lampa.Reguest();
    return netInstance;
  }

  function jfHttp(path, opts) {
    opts = opts || {};
    var base = apiBase();
    var key = apiKey();
    if (!base || !key) return Promise.reject(new Error('Jellyfin URL or API key is empty'));

    var p = String(path || '');
    var url = base + (p.charAt(0) === '/' ? p : '/' + p);
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    if (url.indexOf('api_key=') < 0) url += sep + 'api_key=' + encodeURIComponent(key);

    var timeout = typeof opts.timeout === 'number' ? opts.timeout : HTTP_TIMEOUT_MS;
    var dataType = opts.dataType || 'json';
    var method = (opts.method || 'GET').toUpperCase();
    var postData = method === 'POST' && opts.jsonBody === undefined ? opts.data : undefined;
    var net = network();
    var useJsonAjax = opts.jsonBody !== undefined || method === 'DELETE';

    return new Promise(function (resolve, reject) {
      function ok(raw) {
        if (dataType === 'json' && typeof raw === 'string' && raw.length) {
          try {
            raw = JSON.parse(raw);
          } catch (ignore) { }
        }
        resolve(raw);
      }
      function fail(err) {
        var msg =
          (err && (err.decode_error || err.responseText || err.statusText || err.message)) ||
          (err && err.responseJSON && err.responseJSON.title) ||
          'Request failed';
        reject(new Error(msg));
      }

      if (useJsonAjax) {
        $.ajax({
          url: url,
          type: method,
          timeout: timeout,
          dataType: dataType === 'text' ? 'text' : 'json',
          contentType: opts.jsonBody !== undefined ? 'application/json' : undefined,
          data: opts.jsonBody !== undefined ? JSON.stringify(opts.jsonBody) : undefined,
          headers: {
            'X-Emby-Token': key
          }
        })
          .done(ok)
          .fail(fail);
        return;
      }

      if (!net) {
        Lampa.Network.silent(url, ok, fail, postData, { timeout: timeout, dataType: dataType });
        return;
      }

      net.timeout(timeout);
      net.silent(url, ok, fail, postData, { timeout: timeout, dataType: dataType });
    });
  }

  function tmdbJson(url) {
    if (tmdbPosterInflight[url]) return tmdbPosterInflight[url];
    var net = network();
    var inner = new Promise(function (resolve, reject) {
      if (!net) {
        Lampa.Network.silent(url, resolve, reject, null, {
          timeout: TMDB_TIMEOUT_MS,
          dataType: 'json',
        });
        return;
      }
      net.timeout(TMDB_TIMEOUT_MS);
      net.silent(url, resolve, reject, null, { timeout: TMDB_TIMEOUT_MS, dataType: 'json' });
    });
    tmdbPosterInflight[url] = inner.finally(function () {
      delete tmdbPosterInflight[url];
    });
    return tmdbPosterInflight[url];
  }

  function storedUserId() {
    return storageStr('UserId', '');
  }

  function storedUserLabel() {
    return storageStr('UserLabel', '');
  }

  function invalidateUserCache() {
    cachedUserId = '';
    cachedAutoUserName = '';
    libraryIndex.loadedAt = 0;
  }

  function fetchUsers() {
    return jfHttp('/Users').then(function (users) {
      if (!Array.isArray(users) || !users.length) throw new Error('No Jellyfin users');
      return users;
    });
  }

  function defaultUserFromList(users) {
    if (!users || !users.length) return null;
    var i;
    for (i = 0; i < users.length; i++) {
      if (users[i] && users[i].EnableAutoLogin) return users[i];
    }
    return users
      .slice()
      .sort(function (a, b) {
        return String(a.Name || '').localeCompare(String(b.Name || ''), undefined, {
          sensitivity: 'base',
        });
      })[0];
  }

  function rememberAutoUser(user) {
    if (!user) return;
    cachedAutoUserName = String(user.Name || '');
    if (!storedUserId()) cachedUserId = String(user.Id || '');
  }

  function prefetchAutoUser() {
    if (storedUserId()) return;
    fetchUsers()
      .then(function (users) {
        rememberAutoUser(defaultUserFromList(users));
        try {
          Lampa.Settings.update();
        } catch (e) { }
        syncUserInfoField();
      })
      .catch(function () { });
  }

  function resolveUserId() {
    var picked = storedUserId();
    if (picked) {
      cachedUserId = picked;
      return Promise.resolve(picked);
    }
    if (cachedUserId) return Promise.resolve(cachedUserId);
    return fetchUsers().then(function (users) {
      var user = defaultUserFromList(users);
      if (!user || !user.Id) throw new Error('Invalid Jellyfin user id');
      rememberAutoUser(user);
      return cachedUserId;
    });
  }

  function currentUserLabel() {
    var label = storedUserLabel();
    if (label) return label;
    if (cachedAutoUserName) return cachedAutoUserName;
    return Lampa.Lang.translate('jellyfin_user_auto');
  }

  function autoUserPickTitle(users) {
    var user = defaultUserFromList(users);
    var title = Lampa.Lang.translate('jellyfin_user_auto');
    if (user && user.Name) title += ' — ' + user.Name;
    return title;
  }

  function syncUserInfoField() {
    var $descr = $('[data-name="' + STORAGE_PREFIX + 'UserInfo"] .settings-param__descr');
    if ($descr.length) $descr.text(currentUserLabel());
  }

  function pickUserFromList(onDone) {
    var ctl = enabledControllerName('settings');
    fetchUsers()
      .then(function (users) {
        var items = users.map(function (user) {
          return { title: user.Name || user.Id, userId: String(user.Id || '') };
        });
        rememberAutoUser(defaultUserFromList(users));
        items.unshift({
          title: autoUserPickTitle(users),
          userId: '',
        });
        Lampa.Select.show({
          title: Lampa.Lang.translate('jellyfin_user_pick'),
          items: items,
          onBack: function () {
            deferControllerToggle(ctl);
            if (typeof onDone === 'function') onDone();
          },
          onSelect: function (item) {
            if (!item) return;
            if (item.userId) {
              Lampa.Storage.set(STORAGE_PREFIX + 'UserId', item.userId);
              Lampa.Storage.set(STORAGE_PREFIX + 'UserLabel', item.title || '');
            } else {
              Lampa.Storage.set(STORAGE_PREFIX + 'UserId', '');
              Lampa.Storage.set(STORAGE_PREFIX + 'UserLabel', '');
            }
            invalidateUserCache();
            if (item.userId) cachedAutoUserName = '';
            else prefetchAutoUser();
            Lampa.Settings.update();
            syncUserInfoField();
            deferControllerToggle(ctl);
            if (typeof onDone === 'function') onDone();
          },
        });
      })
      .catch(function () {
        Lampa.Bell.push({ text: Lampa.Lang.translate('jellyfin_auth_fail') });
      });
  }

  function posterUrl(item) {
    if (!item) return IMG_PLACEHOLDER;
    var tag =
      (item.ImageTags && item.ImageTags.Primary) || item.SeriesPrimaryImageTag || '';
    if (!tag) return IMG_PLACEHOLDER;
    var id = item.Id;
    if (!id && item.SeriesId) id = item.SeriesId;
    if (!id) return IMG_PLACEHOLDER;
    return (
      apiBase() +
      '/Items/' +
      encodeURIComponent(id) +
      '/Images/Primary?maxHeight=500&tag=' +
      encodeURIComponent(tag) +
      '&api_key=' +
      encodeURIComponent(apiKey())
    );
  }

  function buildTmdbImageUrl(path) {
    var posterSize = Lampa.Storage.field('poster_size') || 'w342';
    return Lampa.Api.img(path, posterSize);
  }

  function getDeviceId() {
    var key = STORAGE_PREFIX + 'DeviceId';
    var id = String(Lampa.Storage.get(key, '') || '').trim();
    if (id) return id;
    id = 'lampa-' + (Lampa.Utils && Lampa.Utils.uid ? Lampa.Utils.uid() : String(Date.now()));
    Lampa.Storage.set(key, id);
    return id;
  }

  function activePlayerId() {
    try {
      return String(Lampa.Storage.field('player') || Lampa.Storage.get('player', 'inner') || 'inner')
        .trim()
        .toLowerCase();
    } catch (e) {
      return 'inner';
    }
  }

  function usesLampaNativePlayer() {
    var player = activePlayerId();
    if (player === 'inner' || player === 'lampa') return true;

    var Platform = Lampa.Platform;
    if (!Platform || typeof Platform.is !== 'function') return player === 'ios';

    if (Platform.is('apple') && player === 'ios') return true;
    if (Platform.is('webos') && player === 'webos') return false;
    if (Platform.is('android') && player === 'android') return false;
    if (typeof Platform.desktop === 'function' && Platform.desktop() && player === 'other') {
      return false;
    }

    var external = {
      vlc: 1,
      nplayer: 1,
      infuse: 1,
      senplayer: 1,
      vidhub: 1,
      svplayer: 1,
      tracyplayer: 1,
      tvospro: 1,
      tvos: 1,
      tvosl: 1,
      tvosselect: 1,
      mpv: 1,
      iina: 1,
    };
    if (external[player]) return false;

    return true;
  }

  function transcodingEnabled() {
    return usesLampaNativePlayer();
  }

  // --- Функция для запроса PlaybackInfo (POST) ---
  function fetchPlaybackInfo(itemId, userId, opts) {
    opts = opts || {};
    var audioIndex = opts.audioStreamIndex;
    var subIndex = opts.subtitleStreamIndex;
    var startTicks = opts.startTicks || 0;
    var mediaSourceId = opts.mediaSourceId; // может быть undefined

    console.log('[Jellyfin] fetchPlaybackInfo called', { itemId, userId, mediaSourceId, audioIndex, subIndex, startTicks });

    var postBody = {
      UserId: userId,
      StartTimeTicks: startTicks,
      IsPlayback: true,
      AutoOpenLiveStream: true,
      AlwaysBurnInSubtitleWhenTranscoding: false,
      SubtitleProfiles: [
        { Format: 'ass', Method: 'External' },
        { Format: 'subrip', Method: 'External' }
      ],
      DirectPlayProfiles: [
        { Container: 'hls', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac' }
      ],
      TranscodingProfiles: [
        { Container: 'hls', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac' }
      ],
      MaxStreamingBitrate: TRANSCODE_QUALITY.maxStreamingBitrate,
      MaxStaticBitrate: TRANSCODE_QUALITY.maxStreamingBitrate,
      VideoBitrate: TRANSCODE_QUALITY.videoBitrate,
      AudioBitrate: TRANSCODE_QUALITY.audioBitrate,
      MaxWidth: TRANSCODE_QUALITY.maxWidth,
      h264Profile: 'high,main,baseline,constrainedbaseline',
      h264Level: TRANSCODE_QUALITY.h264Level,
      h264VideoBitDepth: 8,
      h264Deinterlace: true,
      h264RangeType: 'SDR',
      TranscodingMaxAudioChannels: 6,
      EnableAudioVbrEncoding: true,
      BreakOnNonKeyFrames: false
    };

    if (mediaSourceId) {
      postBody.MediaSourceId = mediaSourceId;
    }
    if (audioIndex !== undefined && audioIndex !== null) {
      postBody.AudioStreamIndex = audioIndex;
    }
    if (subIndex !== undefined && subIndex !== null) {
      postBody.SubtitleStreamIndex = subIndex;
    }

    console.log('[Jellyfin] POST body:', postBody);

    return jfHttp('/Items/' + encodeURIComponent(itemId) + '/PlaybackInfo', {
      method: 'POST',
      jsonBody: postBody
    }).then(function (response) {
      console.log('[Jellyfin] PlaybackInfo response:', response);
      return response;
    }).catch(function (err) {
      console.error('[Jellyfin] PlaybackInfo error:', err);
      throw err;
    });
  }

  function mediaSourceId(itemId) {
    return String(itemId || '').replace(/-/g, '');
  }

  function rowStartTicks(row) {
    if (!row || !(row.resumeSec > 0)) return 0;
    return Math.floor(row.resumeSec * 10000000);
  }

  // --- Функция создания объекта для плеера (для внутреннего плеера с транскодированием) ---
  function buildPlayObject(row, userId, startTicks) {
    var itemId = row.id;
    console.log('[Jellyfin] buildPlayObject start', { itemId, userId, startTicks });

    // Сначала делаем запрос без MediaSourceId, чтобы получить дефолтный источник
    return fetchPlaybackInfo(itemId, userId, { startTicks: startTicks })
      .then(function (info) {
        console.log('[Jellyfin] buildPlayObject got info', info);
        var src = info.MediaSources && info.MediaSources[0];
        if (!src) {
          throw new Error('No MediaSources in response');
        }
        if (!src.TranscodingUrl) {
          throw new Error('No TranscodingUrl in MediaSource');
        }

        var streams = src.MediaStreams || [];
        var defAudio = streams.find(function (s) { return s.Type === 'Audio' && s.IsDefault === true; });
        var defSub = streams.find(function (s) { return s.Type === 'Subtitle' && s.IsDefault === true; });
        currentAudioIndex = defAudio ? defAudio.Index : undefined;
        currentSubtitleIndex = defSub ? defSub.Index : undefined;
        currentItemId = itemId;
        currentUserId = userId;
        currentMediaSourceId = src.Id;
        currentPlaySessionId = info.PlaySessionId;
        currentMediaStreams = streams;

        // Добавляем apiBase к TranscodingUrl (он может быть относительным)
        var fullUrl = apiBase() + src.TranscodingUrl;
        console.log('[Jellyfin] Full URL:', fullUrl);

        var playObj = {
          title: row.title,
          url: fullUrl,
          movie: row.raw,
          timeline: { time: startTicks / 10000000 }
        };
        if (row.resumeSec > 0) {
          playObj.timeline = { time: row.resumeSec };
        }
        console.log('[Jellyfin] playObj created:', playObj);
        return playObj;
      });
  }

  // --- Функция обновления плеера при смене аудио/субтитров ---
  function updatePlayerWithNewStreams(itemId, userId, audioIdx, subIdx, startTicks) {
    return fetchPlaybackInfo(itemId, userId, {
      mediaSourceId: currentMediaSourceId,
      audioStreamIndex: audioIdx,
      subtitleStreamIndex: subIdx,
      startTicks: startTicks
    }).then(function (info) {
      var src = info.MediaSources[0];
      if (!src || !src.TranscodingUrl) {
        throw new Error('No TranscodingUrl');
      }
      currentPlaySessionId = info.PlaySessionId;
      currentMediaStreams = src.MediaStreams || [];
      if (audioIdx !== undefined) currentAudioIndex = audioIdx;
      if (subIdx !== undefined) currentSubtitleIndex = subIdx;
      currentMediaSourceId = src.Id;

      var fullUrl = apiBase() + src.TranscodingUrl;

      var currentPlay = Lampa.Player.playdata();
      if (currentPlay) {
        var newPlay = Object.assign({}, currentPlay, { url: fullUrl });
        newPlay.timeline = { time: startTicks / 10000000 };
        Lampa.Player.close();
        Lampa.Player.play(newPlay);
      }
    });
  }

  // --- Настройка дорожек и субтитров в плеере ---
  function setupTracksForJellyfin() {
    Lampa.Player.listener.follow('ready', function (data) {
      console.log('[Jellyfin] Player ready event', data);
      if (!currentMediaStreams || !currentMediaStreams.length) return;

      var audioStreams = currentMediaStreams.filter(function (s) { return s.Type === 'Audio'; });
      var subStreams = currentMediaStreams.filter(function (s) { return s.Type === 'Subtitle'; });

      var tracks = audioStreams.map(function (stream) {
        var label = stream.DisplayTitle || stream.Language || ('Audio ' + stream.Index);
        var selected = (stream.Index === currentAudioIndex);
        var track = {
          index: stream.Index,
          language: stream.Language || '',
          label: label,
          selected: selected
        };
        Object.defineProperty(track, 'enabled', {
          set: function (v) {
            if (v) {
              var itemId = currentItemId;
              var userId = currentUserId;
              var startTicks = (Lampa.Player.playdata() && Lampa.Player.playdata().timeline) ?
                (Lampa.Player.playdata().timeline.time * 10000000) : 0;
              updatePlayerWithNewStreams(itemId, userId, stream.Index, currentSubtitleIndex, startTicks);
              tracks.forEach(function (t) { t.selected = false; });
              track.selected = true;
              Lampa.PlayerPanel.setTracks(tracks);
            }
          },
          get: function () { return track.selected; }
        });
        return track;
      });

      var subs = subStreams.map(function (stream) {
        var label = stream.DisplayTitle || stream.Language || ('Subtitle ' + stream.Index);
        var selected = (stream.Index === currentSubtitleIndex);
        var sub = {
          index: stream.Index,
          language: stream.Language || '',
          label: label,
          selected: selected,
          mode: selected ? 'showing' : 'disabled'
        };
        // Добавляем DeliveryUrl, если есть
        if (stream.DeliveryUrl) {
          sub.url = apiBase() + stream.DeliveryUrl;
        }
        Object.defineProperty(sub, 'mode', {
          set: function (v) {
            if (v === 'showing') {
              var itemId = currentItemId;
              var userId = currentUserId;
              var startTicks = (Lampa.Player.playdata() && Lampa.Player.playdata().timeline) ?
                (Lampa.Player.playdata().timeline.time * 10000000) : 0;
              updatePlayerWithNewStreams(itemId, userId, currentAudioIndex, stream.Index, startTicks);
              subs.forEach(function (s) { s.selected = false; s.mode = 'disabled'; });
              sub.selected = true;
              sub.mode = 'showing';
              Lampa.PlayerPanel.setSubs(subs);
            }
          },
          get: function () { return sub.selected ? 'showing' : 'disabled'; }
        });
        return sub;
      });

      if (tracks.length) Lampa.PlayerPanel.setTracks(tracks);
      if (subs.length) Lampa.PlayerPanel.setSubs(subs);
    });
  }

  // --- Функции для работы с элементами (каталог, хаб, карточки) ---
  // (остаются без изменений, см. предыдущий код)
  function tmdbFromItem(item) { /* ... */ }
  function detectQuality(name) { /* ... */ }
  function pad2(n) { /* ... */ }
  function cleanJellyfinName(name) { /* ... */ }
  function episodeNumbers(item) { /* ... */ }
  function episodeCode(item) { /* ... */ }
  function episodeCodeShort(item) { /* ... */ }
  function cleanEpisodeName(name) { /* ... */ }
  function sortEpisodeRows(rows) { /* ... */ }
  function episodeTitle(item, seriesTitle) { /* ... */ }
  function cardTitle(item) { /* ... */ }
  function displayTitleFromMeta(item, meta) { /* ... */ }
  function hubCardTitle(row) { /* ... */ }
  function cardYear(item, meta) { /* ... */ }
  function itemScore(raw) { /* ... */ }
  function mapRow(item, meta) { /* ... */ }
  function ticksToSeconds(ticks) { /* ... */ }
  function fetchTmdbMeta(tmdb) { /* ... */ }
  function promiseAllChunks(items, size, fn) { /* ... */ }
  function enrichRowsFromTmdb(rows) { /* ... */ }
  function dedupeRows(rows) { /* ... */ }
  function filterRows(rows, category) { /* ... */ }
  function processRows(items, category) { /* ... */ }
  function listPath(category, userId, startIndex) { /* ... */ }
  function latestFieldsQuery() { /* ... */ }
  function fetchLatest(userId) { /* ... */ }
  function fetchItems(category, startIndex) { /* ... */ }
  function hubSection(result, category) { /* ... */ }
  function fetchHubData() { /* ... */ }
  function bindJellyfinCard($card, row, ctx) { /* ... */ }
  function applyHubCardMeta($card, row) { /* ... */ }
  function makeJellyfinCard(row, ctx) { /* ... */ }
  function makeFolderCard(folder, onFocus, opts) { /* ... */ }
  function hubCategoryFromKey(key) { /* ... */ }
  function hubLibraryFolders(data) { /* ... */ }
  function buildHubLines(data) { /* ... */ }
  function attachHubRowListener(hubCtx) { /* ... */ }
  function detachHubRowListener(hubCtx) { /* ... */ }
  function hubHasContent(data) { /* ... */ }
  function HubFallbackComponent(object, hubCtx) { /* ... */ }
  function HubComponent(object) { /* ... */ }
  function HubLineFallback(data, hubCtx) { /* ... */ }
  function fetchEpisodes(seriesId) { /* ... */ }
  function refreshLibraryIndex(force) { /* ... */ }
  function findLibraryRow(method, id) { /* ... */ }
  function enabledControllerName(fallback) { /* ... */ }
  function deferControllerToggle(name) { /* ... */ }
  function pushCard(tmdb) { /* ... */ }

  // --- Основные функции воспроизведения ---
  function playRow(row, allRows) {
    console.log('[Jellyfin] playRow called', row, allRows);
    var rows = allRows && allRows.length ? allRows : [row];
    resolveUserId()
      .then(function (userId) {
        if (row.type === 'Series') {
          fetchEpisodes(row.id)
            .then(function (eps) {
              if (!eps.length) {
                Lampa.Bell.push({ text: Lampa.Lang.translate('jellyfin_empty') });
                return;
              }
              var resume = eps.find(function (ep) {
                return ep.playedPct > 0 && ep.playedPct < 100;
              });
              if (resume) {
                playSingleItem(resume, eps);
                return;
              }
              if (eps.length === 1) {
                playSingleItem(eps[0], eps);
                return;
              }
              showEpisodePicker(eps);
            })
            .catch(function () {
              Lampa.Bell.push({ text: Lampa.Lang.translate('jellyfin_error') });
            });
          return;
        }
        playSingleItem(row, rows);
      })
      .catch(function (e) {
        console.error('[Jellyfin] playRow error:', e);
        Lampa.Bell.push({ text: Lampa.Lang.translate('jellyfin_error') });
      });
  }

  function playMediaRow(row) {
    playRow(row);
  }

  function playSingleItem(row, allRows) {
    console.log('[Jellyfin] playSingleItem', row, allRows);
    resolveUserId().then(function (userId) {
      var startTicks = rowStartTicks(row);
      console.log('[Jellyfin] transcodingEnabled:', transcodingEnabled());
      if (transcodingEnabled()) {
        buildPlayObject(row, userId, startTicks)
          .then(function (playObj) {
            console.log('[Jellyfin] About to call Lampa.Player.play with', playObj);
            if (allRows && allRows.length > 1) {
              var playlist = allRows.map(function (r) {
                return { title: r.title, url: playObj.url };
              });
              Lampa.Player.playlist(playlist);
            }
            Lampa.Player.play(playObj);
          })
          .catch(function (e) {
            console.error('[Jellyfin] buildPlayObject error:', e);
            Lampa.Bell.push({ text: Lampa.Lang.translate('jellyfin_error') });
          });
      } else {
        var opts = { userId: userId, startTicks: startTicks };
        var url = streamUrl(row.id, opts);
        var playObj = {
          title: row.title,
          url: url,
          movie: row.raw,
          timeline: { time: startTicks / 10000000 }
        };
        if (row.resumeSec > 0) {
          playObj.timeline = { time: row.resumeSec };
        }
        console.log('[Jellyfin] External player playObj', playObj);
        Lampa.Player.play(playObj);
      }
    });
  }

  function streamUrl(itemId, opts) {
    opts = opts || {};
    var id = String(itemId || '');
    if (!id) return '';

    var srcId = opts.mediaSourceId || mediaSourceId(id);
    var parts = [
      'DeviceId=' + encodeURIComponent(getDeviceId()),
      'MediaSourceId=' + encodeURIComponent(srcId),
      'api_key=' + encodeURIComponent(apiKey()),
    ];
    if (opts.userId) parts.push('UserId=' + encodeURIComponent(opts.userId));
    if (opts.startTicks > 0) parts.push('StartTimeTicks=' + encodeURIComponent(String(opts.startTicks)));
    if (opts.playSessionId) parts.push('PlaySessionId=' + encodeURIComponent(opts.playSessionId));
    if (opts.audioStreamIndex !== undefined && opts.audioStreamIndex !== null) {
      parts.push('AudioStreamIndex=' + encodeURIComponent(opts.audioStreamIndex));
    }
    if (opts.subtitleStreamIndex !== undefined && opts.subtitleStreamIndex !== null) {
      parts.push('SubtitleStreamIndex=' + encodeURIComponent(opts.subtitleStreamIndex));
    }
    parts.push('Static=true');
    return apiBase() + '/Videos/' + encodeURIComponent(id) + '/stream?' + parts.join('&');
  }

  // --- Функции меню и карточек ---
  function openMediaCard(row) { /* ... */ }
  function showItemMenu(row) { /* ... */ }
  function setItemWatched(row, watched) { /* ... */ }
  function applyWatchedState(row, watched) { /* ... */ }
  function notifyRowWatchedChange(row, watched) { /* ... */ }
  function injectCardChrome($card, row, opts) { /* ... */ }
  function updateCardPoster($card, row) { /* ... */ }

  // --- Панель категорий (PanelComponent) ---
  // (остаётся без изменений)

  // --- Открытие категорий и хаба ---
  function openCategory(category) { /* ... */ }
  function openHub() { /* ... */ }
  function listenFullCard() { /* ... */ }
  function injectHeadIcon() { /* ... */ }
  function registerMenuButtons() { /* ... */ }
  function registerStyles() { /* ... */ }
  function addSettings() { /* ... */ }

  // --- Инициализация ---
  function init() {
    addLang();
    registerStyles();
    $('body').append(Lampa.Template.get('jellyfin_style', {}, true));

    Lampa.Component.add(PANEL_COMPONENT, PanelComponent);
    Lampa.Component.add(HUB_COMPONENT, HubComponent);
    Lampa.Manifest.plugins = MANIFEST;
    addSettings();
    registerMenuButtons();
    injectHeadIcon();
    listenFullCard();

    setupTracksForJellyfin();

    prefetchAutoUser();
    refreshLibraryIndex(false).catch(function () { });
  }

  if (window.appready) init();
  else
    Lampa.Listener.follow('app', function (e) {
      if (e.type === 'ready') init();
    });
})();
