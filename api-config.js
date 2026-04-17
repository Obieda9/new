/**
 * إعداد عنوان API للمتصفح.
 *
 * ── فصل الاستضافة (ملفاتك على LiteSpeed / cPanel والـ API على Render) ──
 * 1) في Render: PUBLIC_SITE_URL = https://دومين-الموقع-الثابت.com (لـ CORS، بدون مسافة بعد الفاصلة)
 * 2) املأ NODE_BACKEND_ORIGIN أدناه **مرة واحدة** برابط خدمة Render (مثل https://xxx.onrender.com)
 *    بعدها يمكنك تغيير PUBLIC_API_URL وغيره من لوحة Render دون رفع ملفات جديدة.
 *
 * ── كل شيء على Render بنفس الرابط ──
 * اترك NODE_BACKEND_ORIGIN و PRODUCTION_API فارغين؛ السكربت يجلب الإعداد من نفس النطاق تلقائياً.
 */
(function () {
    if (typeof window === 'undefined') return;

    /**
     * رابط خادم Node فقط عندما تكون صفحات HTML على استضافة أخرى.
     * مثال: https://yasmeen-api.onrender.com
     */
    var NODE_BACKEND_ORIGIN = 'https://my-app-vkyp.onrender.com/';

    /** للتوافق مع الإصدارات السابقة — إن وُجد يُستخدم مثل NODE_BACKEND_ORIGIN */
    var PRODUCTION_API = '';

    /** @type {string} مفتاح التطبيق — يطابق DEFAULT_APP_KEY على الخادم و api-config */
    var API_APP_KEY = 'yasmeen';

    var protocol = window.location.protocol;
    var port = window.location.port;
    var hostname = window.location.hostname || '';

    window.API_APP_KEY = API_APP_KEY;

    function backendOriginToPull() {
        var a = String(NODE_BACKEND_ORIGIN || '').trim().replace(/\/$/, '');
        var b = String(PRODUCTION_API || '').trim().replace(/\/$/, '');
        return a || b;
    }

    /** يجلب env-api-override.js من خادم Node (متزامن) حتى تعمل متغيرات Render دون رفع ملفات جديدة */
    function pullEnvFromBackend(originBase) {
        var b = String(originBase || '').trim().replace(/\/$/, '');
        if (!b) return;
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', b + '/env-api-override.js', false);
            xhr.send(null);
            if (xhr.status !== 200 || !xhr.responseText) return;
            var t = xhr.responseText;
            if (t.indexOf('window.API_BASE_URL') === -1 && t.indexOf('__PUBLIC_SITE_URL__') === -1) {
                return;
            }
            (new Function(t))();
        } catch (e) {
            console.warn('Yasmeen api-config: تعذر الاتصال بالخادم', b, e);
        }
    }

    var remote = backendOriginToPull();

    if (remote) {
        pullEnvFromBackend(remote);
        if (!window.API_BASE_URL || !String(window.API_BASE_URL).trim()) {
            window.API_BASE_URL = remote;
        }
        return;
    }

    if (protocol === 'file:') {
        window.API_BASE_URL = 'http://localhost:3000';
        return;
    }

    if (port === '3000') {
        window.API_BASE_URL = '';
        pullEnvFromBackend(window.location.origin);
        return;
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        window.API_BASE_URL = 'http://localhost:3000';
        pullEnvFromBackend('http://localhost:3000');
        return;
    }

    pullEnvFromBackend(window.location.origin);
    if (!window.API_BASE_URL || !String(window.API_BASE_URL).trim()) {
        window.API_BASE_URL = '';
    }
})();

/**
 * عنوان كامل لمسار API (مثل api/submissions).
 */
(function () {
    if (typeof window === 'undefined') return;
    window.resolveYasmeenApiUrl = function (relPath) {
        relPath = String(relPath || '').replace(/^\//, '');
        var cfg =
            typeof window.API_BASE_URL === 'string' && window.API_BASE_URL.trim()
                ? window.API_BASE_URL.replace(/\/$/, '')
                : '';
        if (cfg) {
            return cfg + '/' + relPath;
        }
        try {
            return new URL(relPath, window.location.href).href;
        } catch (e) {
            return '/' + relPath;
        }
    };
})();
