/**
 * عنوان واجهة API (خادم Node في مجلد server).
 *
 * على Render: يمكن ترك PRODUCTION_API فارغاً وإضافة Environment Variables:
 *   PUBLIC_SITE_URL = https://دومينك.com  (لـ CORS + يُحقَن للمتصفح)
 *   PUBLIC_API_URL  = https://رابط-الخدمة.onrender.com  (إن فصلت الواجهة عن الـ API)
 * ثم حمّل env-api-override.js بعد هذا الملف (مضاف في الصفحات).
 *
 * يدوياً: إذا كان الموقع الثابت على دومين والـ API على دومين آخر،
 * عيّن PRODUCTION_API أدناه (بدون / في النهاية).
 */
(function () {
    if (typeof window === 'undefined') return;

    /** @type {string} رابط خادم Node بعد الرفع (فارغ = يُحدَّد تلقائياً حسب البيئة) */
    var PRODUCTION_API = '';
    /** @type {string} مفتاح التطبيق لتحديد قاعدة البيانات على نفس السيرفر */
    var API_APP_KEY = 'yasmeen';

    var protocol = window.location.protocol;
    var port = window.location.port;
    var hostname = window.location.hostname || '';

    window.API_APP_KEY = API_APP_KEY;

    if (PRODUCTION_API) {
        window.API_BASE_URL = PRODUCTION_API.replace(/\/$/, '');
        return;
    }

    if (protocol === 'file:') {
        window.API_BASE_URL = 'http://localhost:3000';
        return;
    }

    if (port === '3000') {
        window.API_BASE_URL = '';
        return;
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        window.API_BASE_URL = 'http://localhost:3000';
        return;
    }

    window.API_BASE_URL = '';
})();

/**
 * عنوان كامل لمسار API (مثل api/submissions).
 * - إذا وُجدت قيمة في API_BASE_URL (مثلاً http://localhost:3000 أو https://api.site.com) تُستخدم كجذر.
 * - وإلا يُحلّ المسار نسبياً من عنوان الصفحة الحالية — مهم عند وضع الملفات داخل مجلد فرعي على نفس الدومين.
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
