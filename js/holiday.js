/**
 * 节假日数据（内置，无需联网）
 * 数据来源：国务院办公厅官方发布
 * 2024年11月12日发布2025年安排，2025年11月4日发布2026年安排
 */

const HOLIDAY_DATA = {
    2025: {
        '01-01': { name: '元旦', holiday: true },
        '01-26': { name: '春节', holiday: false },
        '01-28': { name: '春节', holiday: true },
        '01-29': { name: '春节', holiday: true },
        '01-30': { name: '春节', holiday: true },
        '01-31': { name: '春节', holiday: true },
        '02-01': { name: '春节', holiday: true },
        '02-02': { name: '春节', holiday: true },
        '02-03': { name: '春节', holiday: true },
        '02-04': { name: '春节', holiday: true },
        '02-08': { name: '春节', holiday: false },
        '04-04': { name: '清明节', holiday: true },
        '04-05': { name: '清明节', holiday: true },
        '04-06': { name: '清明节', holiday: true },
        '04-27': { name: '劳动节', holiday: false },
        '05-01': { name: '劳动节', holiday: true },
        '05-02': { name: '劳动节', holiday: true },
        '05-03': { name: '劳动节', holiday: true },
        '05-04': { name: '劳动节', holiday: true },
        '05-05': { name: '劳动节', holiday: true },
        '05-31': { name: '端午节', holiday: true },
        '06-01': { name: '端午节', holiday: true },
        '06-02': { name: '端午节', holiday: true },
        '09-28': { name: '国庆节', holiday: false },
        '10-01': { name: '国庆节', holiday: true },
        '10-02': { name: '国庆节', holiday: true },
        '10-03': { name: '国庆节', holiday: true },
        '10-04': { name: '国庆节', holiday: true },
        '10-05': { name: '国庆节', holiday: true },
        '10-06': { name: '国庆节', holiday: true },
        '10-07': { name: '国庆节', holiday: true },
        '10-08': { name: '国庆节', holiday: true },
        '10-11': { name: '国庆节', holiday: false }
    },
    2026: {
        '01-01': { name: '元旦', holiday: true },
        '01-02': { name: '元旦', holiday: true },
        '01-03': { name: '元旦', holiday: true },
        '01-04': { name: '元旦', holiday: false },
        '02-14': { name: '春节', holiday: false },
        '02-15': { name: '春节', holiday: true },
        '02-16': { name: '春节', holiday: true },
        '02-17': { name: '春节', holiday: true },
        '02-18': { name: '春节', holiday: true },
        '02-19': { name: '春节', holiday: true },
        '02-20': { name: '春节', holiday: true },
        '02-21': { name: '春节', holiday: true },
        '02-22': { name: '春节', holiday: true },
        '02-23': { name: '春节', holiday: true },
        '02-28': { name: '春节', holiday: false },
        '04-04': { name: '清明节', holiday: true },
        '04-05': { name: '清明节', holiday: true },
        '04-06': { name: '清明节', holiday: true },
        '05-01': { name: '劳动节', holiday: true },
        '05-02': { name: '劳动节', holiday: true },
        '05-03': { name: '劳动节', holiday: true },
        '05-04': { name: '劳动节', holiday: true },
        '05-05': { name: '劳动节', holiday: true },
        '05-09': { name: '劳动节', holiday: false },
        '06-19': { name: '端午节', holiday: true },
        '06-20': { name: '端午节', holiday: true },
        '06-21': { name: '端午节', holiday: true },
        '09-20': { name: '国庆节', holiday: false },
        '09-25': { name: '中秋节', holiday: true },
        '09-26': { name: '中秋节', holiday: true },
        '09-27': { name: '中秋节', holiday: true },
        '10-01': { name: '国庆节', holiday: true },
        '10-02': { name: '国庆节', holiday: true },
        '10-03': { name: '国庆节', holiday: true },
        '10-04': { name: '国庆节', holiday: true },
        '10-05': { name: '国庆节', holiday: true },
        '10-06': { name: '国庆节', holiday: true },
        '10-07': { name: '国庆节', holiday: true },
        '10-10': { name: '国庆节', holiday: false }
    }
};

class HolidayService {
    constructor() {
        this.cache = {};
    }

    getYearData(year) {
        if (this.cache[year]) {
            return this.cache[year];
        }

        const data = HOLIDAY_DATA[year];
        if (data) {
            this.cache[year] = data;
            return data;
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
