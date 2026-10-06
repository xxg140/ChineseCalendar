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
        this.goToToday();

        // 节假日数据预热：首屏渲染完成后再异步触发
        const warmup = () => window.holidayService.warmup();
        if ('requestIdleCallback' in window) {
            requestIdleCallback(warmup, { timeout: 1500 });
        } else {
            setTimeout(warmup, 200);
        }

        // 节假日数据到达后，刷新当前视图标记
        window.addEventListener('holiday-updated', () => this.render());
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
        document.getElementById('today-btn').addEventListener('click', () => this.goToToday());

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
            iconSun.style.display = mode === 'light' ? 'block' : 'none';
            iconMoon.style.display = mode === 'dark' ? 'block' : 'none';
            iconAuto.style.display = mode === 'auto' ? 'block' : 'none';
        };

        const applyTheme = (mode) => {
            const isDark = mode === 'auto' ? prefersDark.matches : mode === 'dark';
            document.documentElement.classList.toggle('dark', isDark);
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
            if (!document.hidden && new Date().toDateString() !== this.currentDate.toDateString()) {
                this.goToToday();
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
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isDragging = true;
        }, { passive: true });

        // 触摸移动
        appContainer.addEventListener('touchmove', (e) => {
            if (!isDragging) return;

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
            isDragging = false;

            const deltaX = e.changedTouches[0].clientX - startX;
            const deltaY = e.changedTouches[0].clientY - startY;

            // 水平距离足够大且垂直偏移很小，才算有效滑动
            if (Math.abs(deltaX) >= 80 && Math.abs(deltaY) <= 60) {
                this.slideMonth(deltaX > 0 ? 'right' : 'left');
            }
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

    goToToday() {
        this.currentDate = new Date();
        this.viewDate = new Date();
        this.render();
        this.showDayDetails(this.currentDate);
    }

    slideMonth(direction) {
        const wrapper = document.getElementById('calendar-grid-wrapper');
        const animClass = direction === 'left' ? 'slide-left' : 'slide-right';
        const delta = direction === 'left' ? 1 : -1;

        wrapper.classList.add(animClass);

        setTimeout(() => {
            this.viewDate.setMonth(this.viewDate.getMonth() + delta);
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

        // 当月第一天是星期几 (0=周一, ..., 6=周日)，据此回退到网格起点（周一）
        const firstDayWeek = (new Date(year, month, 1).getDay() + 6) % 7;
        const calendarStartDate = new Date(year, month, 1 - firstDayWeek);
        const todayStr = new Date().toDateString();

        // 填充6周 × 7天 = 42天的完整日历网格
        for (let i = 0; i < 42; i++) {
            const currentDate = new Date(calendarStartDate);
            currentDate.setDate(calendarStartDate.getDate() + i);
            calendarGrid.appendChild(
                this.createDayElement(currentDate, currentDate.getMonth() !== month, todayStr)
            );
        }
    }

    createDayElement(date, isOtherMonth, todayStr) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';

        if (isOtherMonth) {
            dayElement.classList.add('other-month');
        }

        const isToday = date.toDateString() === todayStr;
        if (isToday) {
            dayElement.classList.add('is-today', 'selected');
        }

        const dateInfo = this.calendar.getDateInfo(date);

        // 公历日期
        const solarDateElement = document.createElement('div');
        solarDateElement.className = 'solar-date';
        solarDateElement.textContent = date.getDate();
        dayElement.appendChild(solarDateElement);

        // 节假日标记（休/班）
        const markerElement = document.createElement('div');
        markerElement.className = 'holiday-marker';
        dayElement.appendChild(markerElement);

        const marker = window.holidayService.getMarker(
            date.getFullYear(),
            date.getMonth() + 1,
            date.getDate()
        );
        if (marker) {
            markerElement.textContent = marker;
            markerElement.classList.add(marker === '休' ? 'rest' : 'work');
            dayElement.classList.add(marker === '休' ? 'rest-day' : 'work-day');
        }

        // 今天角标（无节假日角标时显示）
        if (isToday && !marker) {
            const todayLabel = document.createElement('div');
            todayLabel.className = 'today-label';
            todayLabel.textContent = '今';
            dayElement.appendChild(todayLabel);
        }

        // 农历日期：优先显示节日、节气，初一显示月份，其余显示农历日
        const lunarDateElement = document.createElement('div');
        lunarDateElement.className = 'lunar-date-small';
        lunarDateElement.textContent = dateInfo.traditionalFestival
            || dateInfo.modernFestival
            || dateInfo.solarTerm
            || (dateInfo.lunar.day === 1 ? dateInfo.lunar.monthName + '月' : dateInfo.lunar.dayName);
        dayElement.appendChild(lunarDateElement);

        // 点击事件
        dayElement.addEventListener('click', () => {
            document.querySelector('.calendar-day.selected')?.classList.remove('selected');
            dayElement.classList.add('selected');
            this.showDayDetails(date);
        });

        return dayElement;
    }

    showDayDetails(date) {
        const dateInfo = this.calendar.getDateInfo(date);
        const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

        document.getElementById('detail-date').textContent =
            `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
        document.getElementById('detail-lunar').textContent = dateInfo.formatted.lunar;
        document.getElementById('detail-year').textContent = `${dateInfo.lunar.yearGanZhi}年`;
        document.getElementById('detail-zodiac').textContent = dateInfo.formatted.zodiac;

        const huangli = this.calendar.getHuangli(date);
        this._renderHuangliItems('detail-yi', huangli.yi);
        this._renderHuangliItems('detail-ji', huangli.ji);

        document.getElementById('day-detail').style.display = 'block';
    }

    _renderHuangliItems(elementId, items) {
        const box = document.getElementById(elementId);
        box.textContent = '';
        items.forEach(text => {
            const item = document.createElement('span');
            item.className = 'huangli-item';
            item.textContent = text;
            box.appendChild(item);
        });
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
                this.goToToday();
                break;
            case 'Escape':
                e.preventDefault();
                break;
        }
    }

    _scheduleNextDayUpdate() {
        const now = new Date();
        const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
        setTimeout(() => {
            this.goToToday();
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