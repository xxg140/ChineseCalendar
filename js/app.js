/**
 * 日历应用主程序
 * Chinese Lunar Calendar PWA Main Application
 */

class CalendarApp {
    constructor() {
        this.calendar = new ChineseCalendar();
        this.currentDate = new Date();
        this.viewDate = new Date();
        this.deferredPrompt = null;

        this.init();
    }

    init() {
        this.bindEvents();
        this.render();
        this.showDayDetails(new Date());

        // 节假日数据预热：首屏渲染完成后再异步触发
        const warmup = () => {
            if (window.holidayService && typeof window.holidayService.warmup === 'function') {
                window.holidayService.warmup();
            }
        };
        if ('requestIdleCallback' in window) {
            requestIdleCallback(warmup, { timeout: 1500 });
        } else {
            setTimeout(warmup, 200);
        }

        // 节假日数据到达后，局部刷新当前视图标记
        window.addEventListener('holiday-updated', () => {
            if (typeof this.renderHolidays === 'function') {
                this.renderHolidays();
            } else {
                this.render();
            }
        });
    }

    bindEvents() {
        // 导航按钮
        document.getElementById('prev-month').addEventListener('click', () => {
            this.slideMonth('right');
        });

        document.getElementById('next-month').addEventListener('click', () => {
            this.slideMonth('left');
        });

        // 今天按钮
        document.getElementById('today-btn').addEventListener('click', () => {
            this.viewDate = new Date();
            this.render();
            this.showDayDetails(new Date());
        });

        // 日期选择器改变
        document.getElementById('current-month').addEventListener('change', () => {
            this.gotoSelectedDate();
        });

        // 深色模式切换（浅色→深色→自动 三态循环）
        const darkToggle = document.getElementById('dark-toggle');
        const iconSun = darkToggle.querySelector('.icon-sun');
        const iconMoon = darkToggle.querySelector('.icon-moon');
        const iconAuto = darkToggle.querySelector('.icon-auto');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
        const modes = ['light', 'dark', 'auto'];

        const updateIcon = (mode) => {
            iconSun.style.display = 'none';
            iconMoon.style.display = 'none';
            iconAuto.style.display = 'none';
            if (mode === 'light') iconSun.style.display = 'block';
            else if (mode === 'dark') iconMoon.style.display = 'block';
            else iconAuto.style.display = 'block';
        };

        const applyTheme = (mode) => {
            if (mode === 'auto') {
                document.body.classList.toggle('dark', prefersDark.matches);
            } else {
                document.body.classList.toggle('dark', mode === 'dark');
            }
        };

        let currentMode = localStorage.getItem('themeMode') || 'auto';
        applyTheme(currentMode);
        updateIcon(currentMode);

        prefersDark.addEventListener('change', () => {
            if (currentMode === 'auto') applyTheme('auto');
        });

        darkToggle.addEventListener('click', () => {
            const idx = modes.indexOf(currentMode);
            currentMode = modes[(idx + 1) % modes.length];
            localStorage.setItem('themeMode', currentMode);
            applyTheme(currentMode);
            updateIcon(currentMode);
        });

        // PWA 安装提示
        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('beforeinstallprompt 事件触发');
            e.preventDefault();
            this.deferredPrompt = e;
        });

        // PWA 安装完成
        window.addEventListener('appinstalled', (e) => {
            console.log('PWA 安装完成');
            this.deferredPrompt = null;
        });

        // 每天零点自动刷新
        this._scheduleNextDayUpdate();

        // 页面重新可见时检查日期是否变化
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                const today = new Date();
                if (today.toDateString() !== this.currentDate.toDateString()) {
                    this.currentDate = today;
                    this.viewDate = new Date();
                    this.render();
                    this.showDayDetails(new Date());
                }
            }
        });

        // 键盘导航
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardNavigation(e);
        });

        // 触摸滑动手势支持
        this.setupTouchGestures();
    }

    setupTouchGestures() {
        // 使用更大的触摸区域 - 整个app容器
        const appContainer = document.getElementById('app');
        if (!appContainer) {
            console.warn('App container not found for touch gestures');
            return;
        }

        let startX = 0;
        let startY = 0;
        let isDragging = false;

        // 触摸开始
        appContainer.addEventListener('touchstart', (e) => {
            // 忽略模态框内的触摸
            if (e.target.closest('.modal')) return;
            
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isDragging = true;
        }, { passive: true });

        // 触摸移动
        appContainer.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            
            // 忽略模态框内的触摸
            if (e.target.closest('.modal')) return;
            
            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const deltaX = Math.abs(currentX - startX);
            const deltaY = Math.abs(currentY - startY);
            
            // 防止页面滚动（仅在明确水平滑动时）
            if (deltaX > deltaY && deltaX > 20) {
                e.preventDefault();
            }
        }, { passive: false });

        // 触摸结束
        appContainer.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            
            // 忽略模态框内的触摸
            if (e.target.closest('.modal')) return;
            
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            const deltaX = endX - startX;
            const deltaY = endY - startY;

            // 移动距离太小，视为点击
            const minSwipeDistance = 80;
            const maxVerticalDistance = 60;

            if (Math.abs(deltaX) < minSwipeDistance) {
                isDragging = false;
                return;
            }

            // 检查是否为有效的水平滑动（垂直偏移必须很小）
            if (Math.abs(deltaY) > maxVerticalDistance) {
                isDragging = false;
                return;
            }

            if (deltaX > 0) {
                // 向右滑动 - 上一个月
                this.slideMonth('right');
            } else {
                // 向左滑动 - 下一个月
                this.slideMonth('left');
            }
            
            isDragging = false;
        }, { passive: true });

        // 防止拖拽时的默认行为
        appContainer.addEventListener('dragstart', (e) => {
            e.preventDefault();
        });

        // 下拉刷新
        let pullStartY = 0;
        let pullStartX = 0;
        let pulling = false;
        let pulled = false;
        let decided = false;
        let rafId = null;
        let currentH = 0;
        const pullIndicator = document.createElement('div');
        pullIndicator.id = 'pull-indicator';
        pullIndicator.textContent = '↓ 下拉刷新';
        pullIndicator.style.cssText = 'text-align:center;font-size:0.75rem;color:#999;height:0;overflow:hidden;width:100%;position:fixed;top:0;left:0;z-index:100;';
        document.body.prepend(pullIndicator);

        document.addEventListener('touchstart', (e) => {
            if (window.scrollY <= 0) {
                pullStartY = e.touches[0].clientY;
                pullStartX = e.touches[0].clientX;
                pulling = true;
                pulled = false;
                decided = false;
            }
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!pulling) return;
            const deltaY = e.touches[0].clientY - pullStartY;
            const deltaX = Math.abs(e.touches[0].clientX - pullStartX);

            if (!decided && (deltaX > 15 || deltaY > 15)) {
                decided = true;
                if (deltaX > deltaY) {
                    pulling = false;
                    return;
                }
            }

            if (decided && deltaX > deltaY) {
                pulling = false;
                return;
            }

            if (deltaY > 10 && window.scrollY <= 0 && !pulled) {
                e.preventDefault();
                currentH = Math.min(deltaY * 0.5, 200);
                if (!rafId) {
                    rafId = requestAnimationFrame(() => {
                        pullIndicator.style.height = currentH + 'px';
                        pullIndicator.style.lineHeight = currentH + 'px';
                        const showRefresh = currentH > 150;
                        if (showRefresh !== pullIndicator._wasRefresh) {
                            pullIndicator.textContent = showRefresh ? '↑ 释放刷新' : '↓ 下拉刷新';
                            pullIndicator._wasRefresh = showRefresh;
                        }
                        rafId = null;
                    });
                }
            }
        }, { passive: false });

        document.addEventListener('touchend', () => {
            if (!pulling) return;
            pulling = false;
            pulled = true;
            if (rafId) cancelAnimationFrame(rafId);
            rafId = null;
            pullIndicator.style.height = '0';
            pullIndicator.style.lineHeight = '0';
            pullIndicator._wasRefresh = false;
            if (currentH > 150) {
                pullIndicator.textContent = '刷新中...';
                location.reload(true);
            }
            currentH = 0;
        }, { passive: true });
    }

    render() {
        this.renderHeader();
        this.renderCalendar();
    }

    slideMonth(direction) {
        const wrapper = document.getElementById('calendar-grid-wrapper');
        const animClass = direction === 'left' ? 'slide-left' : 'slide-right';

        wrapper.classList.add(animClass);

        setTimeout(() => {
            if (direction === 'left') {
                this.viewDate.setMonth(this.viewDate.getMonth() + 1);
            } else {
                this.viewDate.setMonth(this.viewDate.getMonth() - 1);
            }
            this.render();
        }, 150);

        setTimeout(() => {
            wrapper.classList.remove(animClass);
        }, 300);
    }

    renderHeader() {
        const monthYearElement = document.getElementById('current-month');
        monthYearElement.value = this.formatDate(this.viewDate);
    }

    renderCalendar() {
        const calendarGrid = document.getElementById('calendar-grid');
        calendarGrid.innerHTML = '';

        const year = this.viewDate.getFullYear();
        const month = this.viewDate.getMonth();

        // 获取当月第一天和最后一天
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();

        // 获取当月第一天是星期几 (0=周一, 1=周二, ..., 6=周日)
        const firstDayWeek = (firstDay.getDay() + 6) % 7;

        // 获取上个月最后一天的日期
        const prevMonthLastDay = new Date(year, month, 0);
        const daysInPrevMonth = prevMonthLastDay.getDate();

        // 计算日历开始日期 (确保从周一开始的第一行)
        const calendarStartDate = new Date(year, month, 1 - firstDayWeek);

        // 填充6周 × 7天 = 42天的完整日历网格
        for (let i = 0; i < 42; i++) {
            const currentDate = new Date(calendarStartDate);
            currentDate.setDate(calendarStartDate.getDate() + i);

            // 判断是否是其他月份的日期
            const isOtherMonth = currentDate.getMonth() !== month;

            const dayElement = this.createDayElement(currentDate, isOtherMonth);
            calendarGrid.appendChild(dayElement);
        }
    }

    createDayElement(date, isOtherMonth) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';

        if (isOtherMonth) {
            dayElement.classList.add('other-month');
        }

        // 检查是否是今天
        const today = new Date();
        const isToday = date.getFullYear() === today.getFullYear() &&
            date.getMonth() === today.getMonth() &&
            date.getDate() === today.getDate();

        if (isToday) {
            dayElement.classList.add('is-today');
            dayElement.classList.add('selected');
        }

        // 添加weekday类用于样式
        const weekdayClass = `weekday-${date.getDay()}`;
        dayElement.classList.add(weekdayClass);

        let dateInfo;
        try {
            dateInfo = this.calendar.getDateInfo(date);
        } catch (error) {
            console.error('Error getting date info for', date, error);
            // 创建fallback的dateInfo
            dateInfo = {
                solar: {
                    year: date.getFullYear(),
                    month: date.getMonth() + 1,
                    day: date.getDate(),
                    weekday: date.getDay()
                },
                lunar: {
                    year: date.getFullYear(),
                    month: date.getMonth() + 1,
                    day: date.getDate(),
                    monthName: '月',
                    dayName: '日'
                },
                traditionalFestival: null,
                modernFestival: null,
                solarTerm: null
            };
        }

        // 公历日期
        const solarDateElement = document.createElement('div');
        solarDateElement.className = 'solar-date';
        solarDateElement.textContent = date.getDate();
        dayElement.appendChild(solarDateElement);

        // 节假日标记（休/班）
        const markerElement = document.createElement('div');
        markerElement.className = 'holiday-marker';
        dayElement.appendChild(markerElement);

        // 同步获取节假日标记
        let hasHolidayMarker = false;
        if (window.holidayService) {
            const marker = window.holidayService.getMarker(
                date.getFullYear(),
                date.getMonth() + 1,
                date.getDate()
            );
            if (marker) {
                hasHolidayMarker = true;
                markerElement.textContent = marker;
                if (marker === '休') {
                    markerElement.classList.add('rest');
                    dayElement.classList.add('rest-day');
                } else if (marker === '班') {
                    markerElement.classList.add('work');
                }
            }
        }

        // 今天标记
        if (isToday) {
            dayElement.classList.add('is-today');
            if (!hasHolidayMarker) {
                const todayLabel = document.createElement('div');
                todayLabel.className = 'today-label';
                todayLabel.textContent = '今';
                dayElement.appendChild(todayLabel);
            }
        }

        // 农历日期
        const lunarDateElement = document.createElement('div');
        lunarDateElement.className = 'lunar-date-small';

        // 优先显示节日、节气
        let displayText = '';
        if (dateInfo.traditionalFestival) {
            displayText = dateInfo.traditionalFestival;
            dayElement.classList.add('traditional-festival');
        } else if (dateInfo.modernFestival) {
            displayText = dateInfo.modernFestival;
            dayElement.classList.add('modern-festival');
        } else if (dateInfo.solarTerm) {
            displayText = dateInfo.solarTerm;
            dayElement.classList.add('solar-term');
        } else if (dateInfo.lunar && dateInfo.lunar.day === 1) {
            // 农历初一显示月份 - 使用lunar库提供的月份名称（包含闰月信息）
            displayText = dateInfo.lunar.monthName.endsWith('月') ?
                dateInfo.lunar.monthName :
                dateInfo.lunar.monthName + '月';
            dayElement.classList.add('lunar-first-day');
        } else if (dateInfo.lunar && dateInfo.lunar.dayName) {
            displayText = dateInfo.lunar.dayName;
        } else {
            // 备用逻辑 - 简单显示日期
            displayText = '农历';
        }

        lunarDateElement.textContent = displayText;
        dayElement.appendChild(lunarDateElement);



        // 点击事件
        dayElement.addEventListener('click', () => {
            // 移除之前的选中状态
            const prevSelected = document.querySelector('.calendar-day.selected');
            if (prevSelected) {
                prevSelected.classList.remove('selected');
            }
            // 添加当前选中状态
            dayElement.classList.add('selected');
            this.showDayDetails(date);
        });

        return dayElement;
    }

    showDayDetails(date) {
        const detailPanel = document.getElementById('day-detail');

        let dateInfo;
        try {
            dateInfo = this.calendar.getDateInfo(date);
        } catch (error) {
            console.error('Error getting date info for detail:', error);
            dateInfo = {
                solar: {
                    year: date.getFullYear(),
                    month: date.getMonth() + 1,
                    day: date.getDate(),
                    weekday: date.getDay()
                },
                lunar: {
                    yearGanZhi: '未知',
                    zodiac: '未知'
                },
                formatted: {
                    lunar: '农历信息获取失败',
                    ganZhi: '未知',
                    zodiac: '未知'
                },
                traditionalFestival: null,
                modernFestival: null,
                solarTerm: null
            };
        }

        // 设置日期标题
        const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        const weekdayName = weekdays[date.getDay()];
        document.getElementById('detail-date').textContent = 
            `${date.getMonth() + 1}月${date.getDate()}日 ${weekdayName}`;

        // 农历
        document.getElementById('detail-lunar').textContent = 
            dateInfo.formatted ? dateInfo.formatted.lunar : '未知';

        // 干支
        document.getElementById('detail-ganzhi').textContent = 
            dateInfo.formatted ? dateInfo.formatted.ganZhi : '未知';

        // 年份
        const yearGanZhi = dateInfo.lunar ? dateInfo.lunar.yearGanZhi : '未知';
        document.getElementById('detail-year').textContent = `${yearGanZhi}年`;

        // 生肖
        document.getElementById('detail-zodiac').textContent = 
            dateInfo.formatted ? dateInfo.formatted.zodiac : '未知';

        // 节日
        let festivalText = '无';
        if (dateInfo.traditionalFestival) {
            festivalText = dateInfo.traditionalFestival;
        } else if (dateInfo.modernFestival) {
            festivalText = dateInfo.modernFestival;
        }
        document.getElementById('detail-festival').textContent = festivalText;

        // 节气
        document.getElementById('detail-solarterm').textContent = 
            dateInfo.solarTerm || '无';

        // 显示详情面板
        detailPanel.style.display = 'block';
    }

    gotoSelectedDate() {
        const datePicker = document.getElementById('current-month');
        const selectedDate = datePicker.value;

        if (selectedDate) {
            const [year, month] = selectedDate.split('-').map(Number);
            this.viewDate = new Date(year, month - 1, 1);
            this.render();
            this.showDayDetails(this.viewDate);
        }
    }

    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }

    handleKeyboardNavigation(e) {
        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                this.viewDate.setMonth(this.viewDate.getMonth() - 1);
                this.render();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.viewDate.setMonth(this.viewDate.getMonth() + 1);
                this.render();
                break;
            case 'Home':
            case 't':
            case 'T':
                e.preventDefault();
                this.viewDate = new Date();
                this.render();
                this.showDayDetails(new Date());
                break;
            case 'Escape':
                e.preventDefault();
                break;
        }
    }

    _scheduleNextDayUpdate() {
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const msUntilMidnight = tomorrow - now;
        setTimeout(() => {
            this.currentDate = new Date();
            this.viewDate = new Date();
            this.render();
            this.showDayDetails(new Date());
            this._scheduleNextDayUpdate();
        }, msUntilMidnight);
    }

}

// 应用启动
document.addEventListener('DOMContentLoaded', () => {
    new CalendarApp();
});

// 错误处理
window.addEventListener('error', (e) => {
    console.error('应用错误:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('未处理的Promise拒绝:', e.reason);
    e.preventDefault();
});