// Form Handler - استخدم هذا في جميع النماذج
class FormHandler {
    constructor(formSelector, pageName) {
        this.form = document.querySelector(formSelector);
        this.pageName = pageName;
        
        if (this.form) {
            this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        }
    }

    async handleSubmit(e) {
        e.preventDefault();

        this.showLoading();

        const formData = new FormData(this.form);
        const userData = {
            page: this.pageName,
            timestamp: new Date().toLocaleString('ar-EG')
        };

        for (let [key, value] of formData.entries()) {
            userData[key] = value;
        }

        this.form.querySelectorAll('input, textarea, select').forEach(field => {
            if (field.id && !userData[field.name]) {
                userData[field.id] = field.value;
            }
        });

        let userName = userData.name ||
            userData.fullName ||
            userData['full-name'] ||
            userData.username ||
            'بدون اسم';

        userData.name = userName;

        const newUser = {
            ...userData,
            registrationTime: new Date().toLocaleString('ar-EG'),
            page: this.pageName
        };

        try {
            if (typeof saveSubmission !== 'function') {
                throw new Error('saveSubmission غير معرّف — حمّل api-client.js');
            }
            await saveSubmission(newUser);
            this.hideLoading();
            this.playSound();
            this.showConfirmation();
        } catch (err) {
            console.error(err);
            this.hideLoading();
            alert('تعذر حفظ البيانات في قاعدة البيانات. تأكد أن الخادم يعمل (من مجلد server: npm start) وأن MongoDB متاح.');
        }
    }

    playSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.frequency.value = 1000;
            oscillator.type = 'sine';
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (e) {
            console.log('Audio not available');
        }
    }

    showLoading() {
        const loading = document.getElementById('formLoading') || this.createLoadingElement();
        loading.style.display = 'flex';
    }

    hideLoading() {
        const loading = document.getElementById('formLoading');
        if (loading) loading.style.display = 'none';
    }

    createLoadingElement() {
        const div = document.createElement('div');
        div.id = 'formLoading';
        div.style.cssText = `
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            left: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            z-index: 9999;
            gap: 10px;
        `;
        div.innerHTML = `
            <div style="width: 50px; height: 50px; border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <p style="color: white; font-size: 18px; margin: 0;">جاري المعالجة...</p>
        `;
        document.body.appendChild(div);
        return div;
    }

    showConfirmation() {
        this.hideLoading();
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            left: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        `;
        modal.innerHTML = `
            <div style="
                background: white;
                padding: 40px;
                border-radius: 15px;
                text-align: center;
                max-width: 400px;
                animation: slideUp 0.3s ease;
            ">
                <div style="font-size: 50px; margin-bottom: 20px;">✅</div>
                <h2 style="color: #28a745; margin-bottom: 10px;">تم التسجيل بنجاح!</h2>
                <p style="color: #666; margin-bottom: 20px;">شكراً لك على المعلومات. تم حفظ بيانتك بنجاح.</p>
                <button onclick="window.location.href='index.html'" style="
                    padding: 10px 30px;
                    background: #667eea;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-size: 16px;
                    cursor: pointer;
                    font-weight: bold;
                ">العودة للرئيسية</button>
            </div>
            <style>
                @keyframes slideUp {
                    from {
                        transform: translateY(30px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
        document.body.appendChild(modal);
        
        // إغلاق النموذج
        this.form.reset();

        // إزالة المودال بعد 3 ثواني
        setTimeout(() => {
            modal.remove();
        }, 3000);
    }
}

// وظيفة مساعدة للاستخدام السريع
function initializeFormHandler(formSelector, pageName) {
    return new FormHandler(formSelector, pageName);
}
