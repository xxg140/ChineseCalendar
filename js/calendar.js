/**
 * 日历计算模块 (基于 6tail/luna-javascript)
 * Chinese Lunar Calendar Calculation Module (Based on 6tail/luna-javascript)
 */

class ChineseCalendar {
    constructor() {
        // 检查浏览器环境中的luna库
        this.Lunar = typeof Lunar !== 'undefined' ? Lunar : null;

        if (!this.Lunar) {
            throw new Error('lunar-javascript library not available. Please ensure lunar.js is loaded.');
        }
    }

    /**
     * 阳历转农历
     * @param {Date} date 日期
     * @param {Object} [lunar] 已创建的 Lunar 对象（复用时避免重复计算）
     */
    solarToLunar(date, lunar) {
        try {
            const l = lunar || this.Lunar.fromDate(date);

            return {
                year: l.getYear(),
                month: l.getMonth(),
                day: l.getDay(),
                isLeapMonth: l.getMonth() < 0, // 负数表示闰月
                monthName: l.getMonthInChinese(),
                dayName: l.getDayInChinese(),
                yearGanZhi: l.getYearInGanZhi(),
                monthGanZhi: l.getMonthInGanZhi(),
                dayGanZhi: l.getDayInGanZhi(),
                zodiac: l.getYearShengXiao()
            };
        } catch (error) {
            console.error('solarToLunar error:', error);
            return null;
        }
    }

    /**
     * 获取二十四节气
     */
    getSolarTerm(date, lunar) {
        const l = lunar || this.Lunar.fromDate(date);

        // 使用lunar库的getJieQi()方法获取节气
        const jieQi = l.getJieQi();

        // 如果当天有节气，返回节气名称
        return jieQi || null;
    }

    /**
     * 格式化农历日期
     */
    formatLunarDate(lunarInfo) {
        if (!lunarInfo) return '';

        // 直接使用lunar库提供的中文格式，它已经包含了闰月处理
        if (lunarInfo.monthName && lunarInfo.dayName) {
            // 确保月份名称包含"月"字
            const monthPart = lunarInfo.monthName.endsWith('月') ?
                lunarInfo.monthName :
                lunarInfo.monthName + '月';
            return `${monthPart}${lunarInfo.dayName}`;
        }

        // 备用格式
        return '农历日期';
    }

    /**
     * 获取传统节日
     */
    getTraditionalFestival(date, lunar) {
        try {
            const l = lunar || this.Lunar.fromDate(date);

            // 获取农历节日
            const lunarFestivals = l.getFestivals();
            if (lunarFestivals && lunarFestivals.length > 0) {
                return lunarFestivals[0]; // 返回第一个节日
            }

            return null;
        } catch (error) {
            console.error('getTraditionalFestival error:', error);
            return null;
        }
    }

    /**
     * 获取现代节日
     */
    getModernFestival(date, lunar) {
        try {
            const l = lunar || this.Lunar.fromDate(date);
            const solar = l.getSolar();

            // 获取阳历节日
            const solarFestivals = solar.getFestivals();
            if (solarFestivals && solarFestivals.length > 0) {
                return solarFestivals[0]; // 返回第一个节日
            }

            return null;
        } catch (error) {
            console.error('getModernFestival error:', error);
            return null;
        }
    }

    /**
     * 获取完整的日期信息
     */
    getDateInfo(date) {
        // 只创建一次 Lunar 对象，四项转换复用，避免每天 4 次重复的 fromDate 计算
        const lunar = this.Lunar.fromDate(date);
        const lunarInfo = this.solarToLunar(date, lunar);
        const solarTerm = this.getSolarTerm(date, lunar);
        const traditionalFestival = this.getTraditionalFestival(date, lunar);
        const modernFestival = this.getModernFestival(date, lunar);

        return {
            solar: {
                year: date.getFullYear(),
                month: date.getMonth() + 1,
                day: date.getDate(),
                weekday: date.getDay()
            },
            lunar: lunarInfo,
            solarTerm,
            traditionalFestival,
            modernFestival,
            formatted: {
                lunar: this.formatLunarDate(lunarInfo),
                ganZhi: lunarInfo ? lunarInfo.dayGanZhi : '',
                zodiac: lunarInfo ? lunarInfo.zodiac : ''
            }
        };
    }
}

// 导出类 (兼容浏览器环境)
if (typeof window !== 'undefined') {
    window.ChineseCalendar = ChineseCalendar;
}