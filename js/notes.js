/**
 * 日期备注存储模块
 * 支持新历/农历、不重复/每周/每月/每年；数据存 localStorage 并镜像到 IndexedDB，可导出/导入备份
 */

class NoteStore {
    constructor(storageKey = 'calendarNotesV1') {
        this.storageKey = storageKey;
        this.notes = [];
        this._dbPromise = null;
        this._load();
        this._restoreFromIDB();
    }

    /**
     * 将 Date 转成本地日期键 YYYY-MM-DD（不用 toISOString，避免时区偏移）
     */
    static toKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    static _newId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    _load() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data || !data.notes) return;

            if (Array.isArray(data.notes)) {
                // 当前格式
                this.notes = data.notes.filter(note => note && note.text);
            } else if (typeof data.notes === 'object') {
                // 旧格式迁移：按日期存的备注 → 新历、不重复
                this.notes = [];
                Object.keys(data.notes).forEach(key => {
                    const parts = key.split('-').map(Number);
                    if (parts.length !== 3 || parts.some(Number.isNaN)) return;
                    (data.notes[key] || []).forEach(note => {
                        if (!note || !note.text) return;
                        this.notes.push({
                            id: note.id || NoteStore._newId(),
                            text: String(note.text).trim(),
                            calendar: 'solar',
                            repeat: 'none',
                            year: parts[0],
                            month: parts[1],
                            day: parts[2],
                            weekday: null
                        });
                    });
                });
            }
        } catch (e) {
            console.error('备注数据读取失败:', e);
        }
    }

    _save() {
        this._writeLocal();
        this._saveToIDB();
    }

    _writeLocal() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify({
                version: 2,
                notes: this.notes
            }));
        } catch (e) {
            console.error('备注数据保存失败:', e);
        }
    }

    /* ---------- IndexedDB 备份副本 ---------- */

    _openDB() {
        if (this._dbPromise) return this._dbPromise;

        this._dbPromise = new Promise(resolve => {
            if (typeof indexedDB === 'undefined') {
                resolve(null);
                return;
            }

            let request;
            try {
                request = indexedDB.open(NoteStore.DB_NAME, NoteStore.DB_VERSION);
            } catch (e) {
                resolve(null);
                return;
            }

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(NoteStore.STORE_NAME)) {
                    db.createObjectStore(NoteStore.STORE_NAME);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
        });

        return this._dbPromise;
    }

    _saveToIDB() {
        this._openDB().then(db => {
            if (!db) return;
            try {
                const tx = db.transaction(NoteStore.STORE_NAME, 'readwrite');
                tx.objectStore(NoteStore.STORE_NAME).put(this.notes, NoteStore.RECORD_KEY);
            } catch (e) {
                console.error('IndexedDB 保存失败:', e);
            }
        });
    }

    /**
     * localStorage 为空时，从 IndexedDB 恢复；有数据时把 IndexedDB 同步成最新
     */
    _restoreFromIDB() {
        this._openDB().then(db => {
            if (!db) return;

            try {
                const tx = db.transaction(NoteStore.STORE_NAME, 'readonly');
                const request = tx.objectStore(NoteStore.STORE_NAME).get(NoteStore.RECORD_KEY);

                request.onsuccess = () => {
                    const saved = Array.isArray(request.result) ? request.result : null;

                    if (this.notes.length === 0) {
                        if (saved && saved.length > 0) {
                            this.notes = saved;
                            this._writeLocal();
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('notes-restored'));
                            }
                        }
                        return;
                    }

                    // localStorage 为准；IndexedDB 为空或落后时同步成最新
                    if (!saved || JSON.stringify(saved) !== JSON.stringify(this.notes)) {
                        this._saveToIDB();
                    }
                };
            } catch (e) {
                console.error('IndexedDB 读取失败:', e);
            }
        });
    }

    all() {
        return this.notes.slice();
    }

    count() {
        return this.notes.length;
    }

    add(data) {
        const text = (data.text || '').trim();
        if (!text) return null;

        const note = {
            id: NoteStore._newId(),
            text,
            calendar: data.calendar === 'lunar' ? 'lunar' : 'solar',
            repeat: ['none', 'weekly', 'monthly', 'yearly'].includes(data.repeat) ? data.repeat : 'none',
            year: data.year || null,
            month: data.month || null,
            day: data.day || null,
            weekday: typeof data.weekday === 'number' ? data.weekday : null
        };
        this.notes.push(note);
        this._save();
        return note;
    }

    remove(id) {
        const index = this.notes.findIndex(note => note.id === id);
        if (index === -1) return false;
        this.notes.splice(index, 1);
        this._save();
        return true;
    }

    update(id, data) {
        const note = this.notes.find(item => item.id === id);
        const text = (data.text || '').trim();
        if (!note || !text) return null;

        note.text = text;
        note.calendar = data.calendar === 'lunar' ? 'lunar' : 'solar';
        note.repeat = ['none', 'weekly', 'monthly', 'yearly'].includes(data.repeat) ? data.repeat : 'none';
        note.year = data.year || null;
        note.month = data.month || null;
        note.day = data.day || null;
        note.weekday = typeof data.weekday === 'number' ? data.weekday : null;
        this._save();
        return note;
    }

    /**
     * 取某一天命中的所有备注
     * lunarInfo 来自 ChineseCalendar.getDateInfo().lunar（month 闰月为负数）
     */
    getForDate(date, lunarInfo) {
        return this.notes.filter(note => NoteStore.matches(note, date, lunarInfo));
    }

    static matches(note, date, lunarInfo) {
        if (note.repeat === 'weekly') {
            return note.weekday !== null && date.getDay() === note.weekday;
        }

        if (note.calendar === 'lunar') {
            if (!lunarInfo) return false;
            // 闰月在数据里用负数表示，精确比较可避免平月备注在闰月重复命中
            const month = lunarInfo.month;
            if (note.repeat === 'yearly') {
                return month === note.month && lunarInfo.day === note.day;
            }
            if (note.repeat === 'monthly') {
                return lunarInfo.day === note.day;
            }
            return lunarInfo.year === note.year
                && month === note.month
                && lunarInfo.day === note.day;
        }

        const month = date.getMonth() + 1;
        const day = date.getDate();
        if (note.repeat === 'yearly') {
            return month === note.month && day === note.day;
        }
        if (note.repeat === 'monthly') {
            return day === note.day;
        }
        return date.getFullYear() === note.year && month === note.month && day === note.day;
    }

    static describe(note) {
        const calendar = note.calendar === 'lunar' ? '农历' : '新历';
        if (note.repeat === 'weekly') {
            return `每周 · ${NoteStore.WEEKDAYS[note.weekday] || ''}`;
        }

        const monthName = note.calendar === 'lunar'
            ? (note.month < 0 ? '闰' : '') + (NoteStore.LUNAR_MONTHS[Math.abs(note.month) - 1] || '')
            : `${note.month}月`;
        const dayName = note.calendar === 'lunar'
            ? NoteStore.LUNAR_DAYS[note.day - 1]
            : `${note.day}日`;

        let text;
        if (note.repeat === 'monthly') {
            text = `每月 · ${calendar} ${dayName}`;
        } else if (note.repeat === 'yearly') {
            text = `每年 · ${calendar} ${monthName}${dayName}`;
        } else {
            text = `${note.year}年 · ${calendar} ${monthName}${dayName}`;
        }

        const other = NoteStore.counterpart(note);
        return other ? `${text}（${other}）` : text;
    }

    /**
     * 备注对应另一种历法的日期，无法换算时返回空字符串
     */
    static counterpart(note) {
        if (!note.year || !note.month || !note.day) return '';

        if (note.calendar === 'lunar') {
            try {
                const solar = Lunar.fromYmd(note.year, note.month, note.day).getSolar();
                return `新历 ${solar.getYear()}年${solar.getMonth()}月${solar.getDay()}日`;
            } catch (e) {
                // 例如农历三十遇到只有二十九天的月份
                return '';
            }
        }

        const lunar = Lunar.fromDate(new Date(note.year, note.month - 1, note.day));
        return `农历 ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
    }

    exportJSON() {
        return JSON.stringify({
            version: 2,
            exportedAt: new Date().toISOString(),
            notes: this.notes
        }, null, 2);
    }

    /**
     * 合并导入，返回新增条数；已存在的同规则备注会跳过
     */
    importJSON(text) {
        const data = JSON.parse(text);
        let incoming;

        if (data && Array.isArray(data.notes)) {
            incoming = data.notes;
        } else if (data && data.notes && typeof data.notes === 'object') {
            // 兼容旧备份：按日期存的备注 → 新历、不重复
            incoming = [];
            Object.keys(data.notes).forEach(key => {
                const parts = key.split('-').map(Number);
                if (parts.length !== 3 || parts.some(Number.isNaN)) return;
                (data.notes[key] || []).forEach(note => {
                    if (!note || !note.text) return;
                    incoming.push({
                        id: note.id,
                        text: note.text,
                        calendar: 'solar',
                        repeat: 'none',
                        year: parts[0],
                        month: parts[1],
                        day: parts[2]
                    });
                });
            });
        } else {
            throw new Error('备份文件格式不正确');
        }

        const signature = note => [
            note.text, note.calendar, note.repeat, note.year, note.month, note.day, note.weekday
        ].join('|');
        const existing = new Set(this.notes.map(signature));

        let added = 0;
        incoming.forEach(raw => {
            if (!raw || typeof raw.text !== 'string' || !raw.text.trim()) return;

            const note = {
                id: raw.id ? String(raw.id) : NoteStore._newId(),
                text: raw.text.trim(),
                calendar: raw.calendar === 'lunar' ? 'lunar' : 'solar',
                repeat: ['none', 'weekly', 'monthly', 'yearly'].includes(raw.repeat) ? raw.repeat : 'none',
                year: raw.year || null,
                month: raw.month || null,
                day: raw.day || null,
                weekday: typeof raw.weekday === 'number' ? raw.weekday : null
            };

            const sig = signature(note);
            if (existing.has(sig)) return;
            existing.add(sig);
            this.notes.push(note);
            added++;
        });

        if (added > 0) this._save();
        return added;
    }
}

NoteStore.LUNAR_MONTHS = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
NoteStore.LUNAR_DAYS = [
    '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
    '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
];
NoteStore.WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

NoteStore.DB_NAME = 'calendarNotesDB';
NoteStore.DB_VERSION = 1;
NoteStore.STORE_NAME = 'notes';
NoteStore.RECORD_KEY = 'notes';

if (typeof window !== 'undefined') {
    window.NoteStore = NoteStore;
}
