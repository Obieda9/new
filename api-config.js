/**
 * عنوان واجهة API (خادم Node في مجلد server).
 *
 * للنشر: إذا كان الموقع الثابت على دومين والـ API على دومين/خادم آخر،
 * عيّن PRODUCTION_API أدناه (بدون / في النهاية)، مثال: https://api.yoursite.com
 *
 * إذا استخدمت nginx/الاستضافة لتوجيه yoursite.com/api → نفس الخادم، اترك PRODUCTION_API فارغاً.
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
