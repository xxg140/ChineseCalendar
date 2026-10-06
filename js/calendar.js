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
     * 获取完整的日期信息
     * 只创建一次 Lunar 对象，农历/节气/节日全部复用，避免重复计算
     */
    getDateInfo(date) {
        const l = this.Lunar.fromDate(date);
        const monthName = l.getMonthInChinese();
        const dayName = l.getDayInChinese();

        return {
            solar: {
                year: date.getFullYear(),
                month: date.getMonth() + 1,
                day: date.getDate(),
                weekday: date.getDay()
            },
            lunar: {
                year: l.getYear(),
                month: l.getMonth(),
                day: l.getDay(),
                isLeapMonth: l.getMonth() < 0, // 负数表示闰月
                monthName,
                dayName,
                yearGanZhi: l.getYearInGanZhi(),
                zodiac: l.getYearShengXiao()
            },
            solarTerm: l.getJieQi() || null,
            traditionalFestival: l.getFestivals()[0] || null,
            modernFestival: l.getSolar().getFestivals()[0] || null,
            formatted: {
                lunar: `${monthName}月${dayName}`,
                zodiac: l.getYearShengXiao()
            }
        };
    }

    /**
     * 获取黄历宜忌
     * 查表需整串扫描 DAY_YI_JI，开销较大，仅供选中日期的详情面板调用
     */
    getHuangli(date) {
        const l = this.Lunar.fromDate(date);
        return {
            yi: l.getDayYi(),
            ji: l.getDayJi()
        };
    }
}

// 导出类 (兼容浏览器环境)
if (typeof window !== 'undefined') {
    window.ChineseCalendar = ChineseCalendar;
}
