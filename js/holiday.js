/**
 * 节假日服务 - API + 本地缓存
 * 有网时从API获取并缓存，离线时使用缓存数据
 * API来源: timor.tech
 */

class HolidayService {
    constructor() {
        this.cache = {};
        this.updating = false;
        this.currentYear = new Date().getFullYear();
        this.API_BASE = 'https://timor.tech/api/holiday/year';
        this.CACHE_KEY = 'holiday_cache';

        this.loadCache();
        // 不再构造时立刻拉取，改为外部显式调用 warmup()
    }

    /**
     * 预热缓存：先只拉当年，其他年份在 render() 时按需补齐
     * 调用方应保证在首屏渲染完成后再触发
     */
    warmup() {
        this.fetchYear(this.currentYear);
    }

    fetchYear(year) {
        if (this.updating) return;
        this.updating = true;

        fetch(`${this.API_BASE}/${year}`)
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then((result) => {
                if (result.code === 0 && result.holiday) {
                    const data = {};
                    for (const [date, info] of Object.entries(result.holiday)) {
                        data[date] = {
                            name: info.name.replace(/[（休）（班）]/g, ''),
                            holiday: info.holiday
                        };
                    }
                    this.cache[year] = data;
                    this.saveCache();
                    // 通知 UI 重新渲染节假日标记
                    window.dispatchEvent(new CustomEvent('holiday-updated', { detail: { year } }));
                }
            })
            .catch((e) => {
                console.warn(`获取${year}年数据失败:`, e);
            })
            .finally(() => {
                this.updating = false;
            });
    }

    // 兼容旧调用：仍然可用 updateFromAPI() 一次拉多年
    updateFromAPI() {
        const years = [this.currentYear - 2, this.currentYear - 1, this.currentYear, this.currentYear + 1];
        years.forEach((y) => this.fetchYear(y));
    }

    loadCache() {
        try {
            const cached = localStorage.getItem(this.CACHE_KEY);
            if (cached) {
                this.cache = JSON.parse(cached);
            }
        } catch (e) {
            console.warn('加载缓存失败:', e);
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
        if (this.cache[year]) {
            return this.cache[year];
        }
        return null;
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
