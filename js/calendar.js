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
     */
    solarToLunar(date) {
        try {
            const lunar = this.Lunar.fromDate(date);

            return {
                year: lunar.getYear(),
                month: lunar.getMonth(),
                day: lunar.getDay(),
                isLeapMonth: lunar.getMonth() < 0, // 负数表示闰月
                monthName: lunar.getMonthInChinese(),
                dayName: lunar.getDayInChinese(),
                yearGanZhi: lunar.getYearInGanZhi(),
                monthGanZhi: lunar.getMonthInGanZhi(),
                dayGanZhi: lunar.getDayInGanZhi(),
                zodiac: lunar.getYearShengXiao()
            };
        } catch (error) {
            console.error('solarToLunar error:', error);
            return null;
        }
    }

    /**
     * 获取二十四节气
     */
    getSolarTerm(date) {
        const lunar = this.Lunar.fromDate(date);

        // 使用lunar库的getJieQi()方法获取节气
        const jieQi = lunar.getJieQi();

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
    getTraditionalFestival(date) {
        try {
            const lunar = this.Lunar.fromDate(date);
            
            // 获取农历节日
            const lunarFestivals = lunar.getFestivals();
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
    getModernFestival(date) {
        try {
            const solar = this.Lunar.fromDate(date).getSolar();
            
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
        const lunarInfo = this.solarToLunar(date);
        const solarTerm = this.getSolarTerm(date);
        const traditionalFestival = this.getTraditionalFestival(date);
        const modernFestival = this.getModernFestival(date);

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