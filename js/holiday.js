/**
 * 节假日服务 - API + 本地缓存
 * 有网时从API获取并缓存，离线时使用缓存数据
 * API来源: chinese-days (npm 公开数据包，无需密钥)
 * 整包使用浮动版本自动更新，最多每 12 小时拉取一次，缺年份时按年兜底补拉
 */

class HolidayService {
    constructor() {
        this.cache = {};
        this.pendingYears = new Set();
        this.batchPromise = null;
        this.lastFetchAt = 0;
        this.yearAttempts = {};
        this.currentYear = new Date().getFullYear();
        // 同一份数据的多个镜像，按顺序回退
        this.API_BASES = [
            'https://cdn.jsdelivr.net/npm/chinese-days@1/dist',
            'https://fastly.jsdelivr.net/npm/chinese-days@1/dist',
            'https://gcore.jsdelivr.net/npm/chinese-days@1/dist',
            'https://testingcf.jsdelivr.net/npm/chinese-days@1/dist'
        ];
        this.CACHE_KEY = 'holiday_cache';
        this.FETCH_META_KEY = 'holiday_fetch_meta';
        // 距上次拉取的刷新间隔：无论成功失败都重新计时
        this.REFRESH_MS = 12 * 60 * 60 * 1000;

        this.loadCache();
        this.loadFetchMeta();
        // 不再构造时立刻拉取，改为外部显式调用 warmup()
    }

    /**
     * 预热缓存：一个请求拉取全部年份，调用方应保证在首屏渲染完成后再触发
     */
    warmup() {
        this.ensureAll();
    }

    /**
     * 确保某年数据可用：优先拉整包，整包在刷新周期内时按年兜底补拉
     */
    ensureYear(year) {
        if (this.cache[year]) return;
        if (this.batchPromise) return;
        if (this.ensureAll()) return;
        this.ensureYearFallback(year);
    }

    /**
     * 整包刷新：距上次拉取满 12 小时才请求，返回本次是否发起了请求
     */
    ensureAll() {
        if (this.batchPromise) return true;
        if (Date.now() - this.lastFetchAt < this.REFRESH_MS) return false;

        // 先记时间再请求：失败同样进入下一轮 12 小时周期
        this.lastFetchAt = Date.now();
        this.saveFetchMeta();
        this.batchPromise = this.fetchFromMirrors('/chinese-days.json')
            .then((result) => {
                const byYear = this.parseAllYears(result);
                if (!Object.keys(byYear).length) return;

                Object.assign(this.cache, byYear);
                this.saveCache();
                // 通知 UI 重新渲染节假日标记
                window.dispatchEvent(new CustomEvent('holiday-updated'));
            })
            .catch((e) => {
                console.warn('获取节假日数据失败:', e);
            })
            .finally(() => {
                this.batchPromise = null;
            });
        return true;
    }

    /**
     * 整包缺少该年份时（如新一年数据尚未合入浮动版本）单独按年拉取
     */
    ensureYearFallback(year) {
        if (this.cache[year] || this.pendingYears.has(year)) return;
        if (Date.now() - (this.yearAttempts[year] || 0) < this.REFRESH_MS) return;

        this.pendingYears.add(year);
        this.yearAttempts[year] = Date.now();
        this.saveFetchMeta();
        this.fetchFromMirrors(`/years/${year}.json`)
            .then((result) => {
                const data = this.parseAllYears(result)[year];
                if (!data) return;

                this.cache[year] = data;
                this.saveCache();
                window.dispatchEvent(new CustomEvent('holiday-updated', { detail: { year } }));
            })
            .catch((e) => {
                console.warn(`获取${year}年数据失败:`, e);
            })
            .finally(() => {
                this.pendingYears.delete(year);
            });
    }

    async fetchFromMirrors(path) {
        let lastError;
        for (const base of this.API_BASES) {
            const url = base + path;
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return await response.json();
            } catch (e) {
                lastError = e;
                console.warn('镜像获取节假日数据失败:', url, e);
            }
        }
        throw lastError;
    }

    /**
     * 转换为 { 年: { 'MM-DD': { name, holiday } } }，与旧缓存结构保持一致
     * chinese-days 格式：{ holidays, workdays, inLieuDays }，值为 '英文名,中文名,天数'
     */
    parseAllYears(result) {
        const byYear = {};

        const addEntries = (map, holiday) => {
            if (!map) return;
            for (const [date, value] of Object.entries(map)) {
                const name = String(value).split(',')[1];
                if (!name) continue;
                const [year, month, day] = date.split('-');
                if (!byYear[year]) byYear[year] = {};
                byYear[year][`${month}-${day}`] = { name, holiday };
            }
        };

        // 先补班后放假，日期若有重叠以放假为准
        addEntries(result.workdays, false);
        addEntries(result.holidays, true);

        return byYear;
    }

    loadCache() {
        try {
            const cached = localStorage.getItem(this.CACHE_KEY);
            if (!cached) return;

            // 丢弃空数据（旧版本可能缓存过未公布年份的空对象）
            for (const [year, data] of Object.entries(JSON.parse(cached))) {
                if (data && Object.keys(data).length) {
                    this.cache[year] = data;
                }
            }
        } catch (e) {
            console.warn('加载缓存失败:', e);
        }
    }

    loadFetchMeta() {
        try {
            const meta = JSON.parse(localStorage.getItem(this.FETCH_META_KEY) || 'null');
            if (!meta) return;

            this.lastFetchAt = meta.bundle || 0;
            this.yearAttempts = meta.years || {};
        } catch (e) {
            console.warn('加载拉取记录失败:', e);
        }
    }

    saveFetchMeta() {
        try {
            localStorage.setItem(this.FETCH_META_KEY, JSON.stringify({
                bundle: this.lastFetchAt,
                years: this.yearAttempts
            }));
        } catch (e) {
            console.warn('保存拉取记录失败:', e);
        }
    }

    saveCache() {
        try {
            localStorage.setItem(this.CACHE_KEY, JSON.stringify(this.cache));
        } catch (e) {
            console.warn('保存缓存失败:', e);
        }
    }

    getYearData(year) {
        return this.cache[year] || null;
    }

    getMarker(year, month, day) {
        const holidayData = this.getYearData(year);
        if (!holidayData) return null;

        const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const info = holidayData[key];
        if (!info) return null;

        if (info.holiday === true) return '休';
        if (info.holiday === false && info.name) return '班';
        return null;
    }
}

if (typeof window !== 'undefined') {
    window.holidayService = new HolidayService();
}
