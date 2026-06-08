// المتغيرات العالمية لخرائط Leaflet
let map;
let userMarker;
let userCircle;
let activeClickCoords = null;
let reminders = [];

// 1. تشغيل التطبيق وإعداد الخريطة
window.onload = function() {
    // إعداد الخريطة وإعطائها إحداثيات افتراضية (الجزائر كمثال مبدئي)
    map = L.map('map').setView([35.19, -0.63], 13); 

    // تحميل طبقة الخريطة المرئية من OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // طلب تفعيل الإشعارات في المتصفح
    if (Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    // تتبع موقع المستخدم الفعلي والحي
    trackUserLocation();

    // الاستماع للنقر على الخريطة لإضافة تذكير
    map.on('click', onMapClick);

    // ربط أزرار النموذج
    document.getElementById('save-btn').addEventListener('click', saveReminder);
    document.getElementById('cancel-btn').addEventListener('click', () => {
        document.getElementById('reminder-form').classList.add('hidden');
    });

    // تحميل التذكيرات القديمة إن وجدت في الذاكرة المحلية
    loadReminders();
};

// 2. تتبع موقع المستخدم الفعلي في الوقت الحقيقي
function trackUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // تحديث مكان المستخدم على الخريطة بنقطة زرقاء
            if (!userMarker) {
                userMarker = L.marker([lat, lng], {
                    icon: L.icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                        shadowSize: [41, 41]
                    })
                }).addTo(map).bindPopup("أنت هنا حالياً").openPopup();
                map.setView([lat, lng], 15);
            } else {
                userMarker.setLatLng([lat, lng]);
            }

            // فحص المسافات لمعرفة هل دخل المستخدم نطاق أي تذكير
            checkGeofences(lat, lng);

        }, function(error) {
            console.error("خطأ في جلب الموقع الجغرافي:", error);
        }, {
            enableHighAccuracy: true, // دقة عالية باستخدام الـ GPS
            maximumAge: 0
        });
    } else {
        alert("متصفحك لا يدعم خاصية تحديد الموقع الجغرافي.");
    }
}

// 3. عند الضغط على الخريطة
function onMapClick(e) {
    activeClickCoords = e.latlng;
    // إظهار قائمة إدخال البيانات في الجانب
    document.getElementById('reminder-form').classList.remove('hidden');
    document.getElementById('reminder-text').focus();
}

// 4. حفظ التذكير في المصفوفة والذاكرة المحلية
function saveReminder() {
    const text = document.getElementById('reminder-text').value.trim();
    const radius = parseInt(document.getElementById('reminder-radius').value);

    if (!text || !activeClickCoords) {
        alert("الرجاء كتابة نص التذكير.");
        return;
    }

    const reminder = {
        id: Date.now(),
        text: text,
        lat: activeClickCoords.lat,
        lng: activeClickCoords.lng,
        radius: radius,
        triggered: false
    };

    reminders.push(reminder);
    saveToLocalStorage();
    renderReminders();
    addReminderToMap(reminder);

    // إعادة تصغير واجهة الإدخال وتنظيفها
    document.getElementById('reminder-text').value = '';
    document.getElementById('reminder-form').classList.add('hidden');
}

// 5. رسم التذكير جغرافياً على الخريطة (علامة + دائرة النطاق)
function addReminderToMap(reminder) {
    // علامة حمراء لموقع التذكير
    L.marker([reminder.lat, reminder.lng]).addTo(map)
        .bindPopup(`<b>تذكير:</b> ${reminder.text}<br>النطاق: ${reminder.radius} متر`);

    // رسم دائرة تمثل الجدار الجغرافي (Geofence)
    L.circle([reminder.lat, reminder.lng], {
        color: 'red',
        fillColor: '#f03',
        fillOpacity: 0.15,
        radius: reminder.radius
    }).addTo(map);
}

// 6. معادلة Haversine الرياضية لحساب المسافة الدقيقة بالمتر بين نقطتين
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // نصف قطر الأرض بالمتر
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // المسافة بالمتر
}

// 7. فحص الجدران الجغرافية وإطلاق التنبيهات
function checkGeofences(userLat, userLng) {
    reminders.forEach(reminder => {
        if (!reminder.triggered) {
            const distance = calculateDistance(userLat, userLng, reminder.lat, reminder.lng);
            
            // إذا كانت المسافة الحالية أقل من نطاق التنبيه المحدد
            if (distance <= reminder.radius) {
                triggerNotification(reminder);
                reminder.triggered = true; // لمنع تكرار التنبيه بشكل مزعج
                saveToLocalStorage();
                renderReminders();
            }
        }
    });
}

// 8. إطلاق إشعار حقيقي على شاشة الجهاز
function triggerNotification(reminder) {
    if (Notification.permission === "granted") {
        new Notification("📌 تذكير جغرافي فوري!", {
            body: `لقد اقتربت من موقع: ${reminder.text}`,
            icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png'
        });
    } else {
        // تنبيه احتياطي داخل المتصفح إذا كانت الإشعارات مغلقة
        alert(`🔔 تذكير: ${reminder.text}`);
    }
}

// 9. عرض التذكيرات في القائمة الجانبية
function renderReminders() {
    const list = document.getElementById('reminders-list');
    list.innerHTML = '';

    reminders.forEach(r => {
        const li = document.createElement('li');
        li.className = 'reminder-item';
        if(r.triggered) li.style.borderRightColor = '#6c757d'; // تغيير اللون إذا تم التنبيه مسبقاً
        
        li.innerHTML = `
            <h4>${r.text}</h4>
            <p>النطاق: ${r.radius} متر - ${r.triggered ? '✅ تم التنبيه' : '⏳ في الانتظار'}</p>
        `;
        list.appendChild(li);
    });
}

// 10. الحفظ والتحميل من الـ LocalStorage
function saveToLocalStorage() {
    localStorage.setItem('geo_reminders', JSON.stringify(reminders));
}

function loadReminders() {
    const data = localStorage.getItem('geo_reminders');
    if (data) {
        reminders = JSON.parse(data);
        renderReminders();
        // رسم التذكيرات القديمة على الخريطة عند فتح الموقع مجدداً
        reminders.forEach(r => addReminderToMap(r));
    }
}
