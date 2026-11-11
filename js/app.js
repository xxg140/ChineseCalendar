/**
 * 日历应用主程序
 * Chinese Lunar Calendar PWA Main Application
 */

// 日历格子空间有限，超长节日名用简称显示，完整名称见下方详情面板
const FESTIVAL_SHORT_NAMES = {
    '消费者权益日': '3·15',
    '万圣节前夜': '万圣夜'
};

class CalendarApp {
    constructor() {
        this.calendar = new ChineseCalendar();
        this.currentDate = new Date();
        this.viewDate = new Date();
        this.deferredPrompt = null;
        this.noteStore = new NoteStore();
        this.selectedDateKey = null;
        this.editingNoteId = null;

        this.init();
    }

    init() {
        this.bindEvents();
        this.goToToday();

        // 申请持久存储，降低浏览器自动清理本地数据的概率
        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().catch(() => {});
        }

        // 节假日数据预热：首屏渲染完成后再异步触发
        const warmup = () => window.holidayService.warmup();
        if ('requestIdleCallback' in window) {
            requestIdleCallback(warmup, { timeout: 1500 });
        } else {
            setTimeout(warmup, 200);
        }

        // 节假日数据到达后，刷新当前视图标记
        window.addEventListener('holiday-updated', () => this.render());

        // localStorage 被清空后从 IndexedDB 恢复备注，刷新界面
        window.addEventListener('notes-restored', () => {
            this.renderCalendar();
            this.renderNoteManageList();
            if (this.selectedDateKey) {
                this.showDayDetails(this._dateFromKey(this.selectedDateKey));
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
        document.getElementById('today-btn').addEventListener('click', () => this.goToToday());

        // 日期选择器改变
        document.getElementById('current-month').addEventListener('change', () => {
            this.gotoSelectedDate();
        });

        // 备注表单（设置面板内）
        this.noteForm = { calendar: 'solar', repeat: 'none' };
        this._initNoteFormOptions();

        document.querySelectorAll('#note-calendar .seg-option').forEach(btn => {
            btn.addEventListener('click', () => {
                this.noteForm.calendar = btn.dataset.value;
                this._syncNoteForm(true);
            });
        });
        document.querySelectorAll('#note-repeat .seg-option').forEach(btn => {
            btn.addEventListener('click', () => {
                this.noteForm.repeat = btn.dataset.value;
                this._syncNoteForm(false);
            });
        });
        document.getElementById('note-date').addEventListener('change', () => {
            document.getElementById('note-weekday').value = String(this._formDate().getDay());
            this._syncNoteForm(true);
        });
        ['note-lunar-month', 'note-lunar-day'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => this._syncNoteForm(false));
        });
        document.getElementById('note-add').addEventListener('click', () => this.addNote());
        document.getElementById('note-cancel-edit').addEventListener('click', () => this._cancelEdit());
        document.getElementById('note-text').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addNote();
            }
        });

        // 备注备份：导出 / 导入
        document.getElementById('export-notes').addEventListener('click', () => this.exportNotes());
        document.getElementById('import-notes').addEventListener('click', () => {
            document.getElementById('import-file').click();
        });
        document.getElementById('import-file').addEventListener('change', (e) => {
            this.importNotes(e.target.files[0], e.target);
        });

        // 设置面板：主题切换
        const settingsOverlay = document.getElementById('settings-overlay');
        const themeOptions = Array.from(document.querySelectorAll('.theme-option'));
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

        const applyTheme = (mode) => {
            const isDark = mode === 'auto' ? prefersDark.matches : mode === 'dark';
            document.documentElement.classList.toggle('dark', isDark);
        };

        const updateThemeOptions = (mode) => {
            themeOptions.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === mode);
            });
        };

        let currentMode = localStorage.getItem('themeMode') || 'auto';
        applyTheme(currentMode);
        updateThemeOptions(currentMode);

        prefersDark.addEventListener('change', () => {
            if (currentMode === 'auto') applyTheme('auto');
        });

        themeOptions.forEach(btn => {
            btn.addEventListener('click', () => {
                currentMode = btn.dataset.mode;
                localStorage.setItem('themeMode', currentMode);
                applyTheme(currentMode);
                updateThemeOptions(currentMode);
            });
        });

        // 打开 / 关闭设置面板
        document.getElementById('settings-btn').addEventListener('click', () => {
            this._prepareNoteForm();
            settingsOverlay.hidden = false;
        });
        document.getElementById('settings-close').addEventListener('click', () => {
            settingsOverlay.hidden = true;
        });
        settingsOverlay.addEventListener('click', (e) => {
            if (e.target === settingsOverlay) settingsOverlay.hidden = true;
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
                this._forceReload();
            }
            currentH = 0;
        }, { passive: true });
    }

    /**
     * 强制刷新：先注销 Service Worker 并清掉缓存，再带时间戳跳转，确保拿到线上最新文件
     */
    _forceReload() {
        console.log('[强制刷新] 开始执行');
        let done = false;
        const go = () => {
            if (done) return;
            done = true;
            console.log('[强制刷新] 跳转到新 URL');
            location.replace(location.href.split('?')[0] + '?t=' + Date.now());
        };

        const clear = async () => {
            if (!navigator.serviceWorker) return;
            const registrations = await navigator.serviceWorker.getRegistrations();
            console.log('[强制刷新] 找到 ' + registrations.length + ' 个 Service Worker 注册');
            await Promise.all(registrations.map(registration =>
                registration.unregister()
                    .then(success => {
                        console.log('[强制刷新] SW 注销结果: ' + (success ? '成功' : '失败') + ' (scope: ' + registration.scope + ')');
                    })
                    .catch(err => {
                        console.warn('[强制刷新] SW 注销异常: ' + err.message);
                    })
            ));
            if (typeof caches !== 'undefined') {
                const keys = await caches.keys();
                await Promise.all(keys.map(key => caches.delete(key)));
            }
        };

        clear()
            .catch(err => console.warn('[强制刷新] SW 注销流程异常: ' + err.message))
            .finally(go);
        // 2 秒兜底：防止 SW 接口异常或页面后台冻结时注销流程永远不结束
        setTimeout(go, 2000);
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
            // 逐月切换时把选中日带到新月份（月底自动收敛），避免选中态和详情面板失联
            const anchor = this.selectedDateKey ? this._dateFromKey(this.selectedDateKey) : this.viewDate;
            const target = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() + delta, 1);
            this.viewDate = target;

            const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
            const nextDate = new Date(target.getFullYear(), target.getMonth(), Math.min(anchor.getDate(), lastDay));
            this.showDayDetails(nextDate);
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

        // 确保当前视图涉及年份的节假日已加载（含跨年显示的相邻月份）
        window.holidayService.ensureYear(year);
        if (month === 0) window.holidayService.ensureYear(year - 1);
        if (month === 11) window.holidayService.ensureYear(year + 1);

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

        const dateKey = NoteStore.toKey(date);
        const isToday = date.toDateString() === todayStr;
        if (isToday) {
            dayElement.classList.add('is-today');
        }

        // 选中态：优先跟随当前选中的日期，首屏默认今天
        const isSelected = this.selectedDateKey ? dateKey === this.selectedDateKey : isToday;
        if (isSelected) {
            dayElement.classList.add('selected');
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
        const festival = dateInfo.traditionalFestival || dateInfo.modernFestival;
        const festivalLabel = festival ? (FESTIVAL_SHORT_NAMES[festival] || festival) : null;
        lunarDateElement.textContent = festivalLabel
            || dateInfo.solarTerm
            || (dateInfo.lunar.day === 1 ? dateInfo.lunar.monthName + '月' : dateInfo.lunar.dayName);
        dayElement.appendChild(lunarDateElement);

        // 有备注时在日期下方显示小圆点
        const dayNotes = this.noteStore.getForDate(date, dateInfo.lunar);
        if (dayNotes.length > 0) {
            const noteDot = document.createElement('span');
            noteDot.className = 'note-dot';
            dayElement.appendChild(noteDot);
        }

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

        this.selectedDateKey = NoteStore.toKey(date);

        const festival = dateInfo.traditionalFestival || dateInfo.modernFestival;
        document.getElementById('detail-date').textContent =
            `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}${festival ? ' · ' + festival : ''}`;
        document.getElementById('detail-lunar').textContent = dateInfo.formatted.lunar;
        document.getElementById('detail-year').textContent = `${dateInfo.lunar.yearGanZhi}年`;
        document.getElementById('detail-zodiac').textContent = dateInfo.formatted.zodiac;

        const huangli = this.calendar.getHuangli(date);
        this._renderHuangliItems('detail-yi', huangli.yi);
        this._renderHuangliItems('detail-ji', huangli.ji);

        this._renderDetailNotes(date, dateInfo);

        document.getElementById('day-detail').style.display = 'block';
    }

    _renderDetailNotes(date, dateInfo) {
        const row = document.getElementById('detail-notes');
        const value = document.getElementById('detail-note-value');
        const notes = this.noteStore.getForDate(date, dateInfo.lunar);

        if (notes.length === 0) {
            row.style.display = 'none';
            value.textContent = '';
            return;
        }

        value.textContent = notes.map(note => note.text).join('、');
        row.style.display = 'flex';
    }

    _initNoteFormOptions() {
        const daySelect = document.getElementById('note-lunar-day');
        NoteStore.LUNAR_DAYS.forEach((name, index) => {
            const option = document.createElement('option');
            option.value = String(index + 1);
            option.textContent = name;
            daySelect.appendChild(option);
        });

        const weekdaySelect = document.getElementById('note-weekday');
        NoteStore.WEEKDAYS.forEach((name, index) => {
            const option = document.createElement('option');
            option.value = String(index);
            option.textContent = name;
            weekdaySelect.appendChild(option);
        });
    }

    /**
     * 按农历年份重建月份选项：该年有闰月时额外提供“闰X月”，值为负数
     */
    _fillLunarMonthOptions(lunarYear) {
        const monthSelect = document.getElementById('note-lunar-month');
        monthSelect.textContent = '';

        NoteStore.LUNAR_MONTHS.forEach((name, index) => {
            monthSelect.appendChild(new Option(name, String(index + 1)));
        });

        const leapMonth = LunarYear.fromYear(lunarYear).getLeapMonth();
        if (leapMonth > 0) {
            monthSelect.appendChild(new Option(`闰${NoteStore.LUNAR_MONTHS[leapMonth - 1]}`, String(-leapMonth)));
        }
    }

    _prepareNoteForm() {
        const baseDate = this.selectedDateKey
            ? this._dateFromKey(this.selectedDateKey)
            : new Date();

        document.getElementById('note-date').value = NoteStore.toKey(baseDate);
        document.getElementById('note-weekday').value = String(baseDate.getDay());

        this.editingNoteId = null;
        this._syncEditUi();
        this._syncNoteForm(true);
        this.renderNoteManageList();
    }

    _syncNoteForm(syncLunar) {
        document.querySelectorAll('#note-calendar .seg-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === this.noteForm.calendar);
        });
        document.querySelectorAll('#note-repeat .seg-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === this.noteForm.repeat);
        });

        const isWeekly = this.noteForm.repeat === 'weekly';
        const isLunar = this.noteForm.calendar === 'lunar';

        document.getElementById('note-date-row').hidden = isWeekly || isLunar;
        document.getElementById('note-lunar-row').hidden = isWeekly || !isLunar;
        document.getElementById('note-weekday-row').hidden = !isWeekly;

        if (syncLunar && isLunar) {
            const lunar = Lunar.fromDate(this._formDate());
            this._fillLunarMonthOptions(lunar.getYear());
            document.getElementById('note-lunar-month').value = String(lunar.getMonth());
            document.getElementById('note-lunar-day').value = String(lunar.getDay());
        }

        this._updateCalendarHint();
    }

    /**
     * 在表单旁显示另一种历法的对照日期
     */
    _updateCalendarHint() {
        const solarHint = document.getElementById('note-solar-hint');
        const lunarHint = document.getElementById('note-lunar-hint');
        solarHint.textContent = '';
        lunarHint.textContent = '';

        if (this.noteForm.repeat === 'weekly') return;

        if (this.noteForm.calendar === 'lunar') {
            const lunarYear = Lunar.fromDate(this._formDate()).getYear();
            const month = Number(document.getElementById('note-lunar-month').value);
            const day = Number(document.getElementById('note-lunar-day').value);

            try {
                const solar = Lunar.fromYmd(lunarYear, month, day).getSolar();
                lunarHint.textContent = `新历 ${solar.getYear()}年${solar.getMonth()}月${solar.getDay()}日`;
            } catch (e) {
                // 例如农历三十遇到只有二十九天的月份
                lunarHint.textContent = '该农历日期不存在';
            }
            return;
        }

        const lunar = Lunar.fromDate(this._formDate());
        solarHint.textContent = `农历 ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
    }

    _formDate() {
        const value = document.getElementById('note-date').value;
        if (value) {
            const [year, month, day] = value.split('-').map(Number);
            return new Date(year, month - 1, day);
        }
        return new Date();
    }

    _dateFromKey(key) {
        const [year, month, day] = key.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    addNote() {
        const textInput = document.getElementById('note-text');
        const text = textInput.value.trim();
        if (!text) {
            textInput.focus();
            return;
        }

        const repeat = this.noteForm.repeat;
        const calendar = this.noteForm.calendar;
        const date = this._formDate();
        const data = { text, calendar, repeat, year: null, month: null, day: null, weekday: null };

        if (repeat === 'weekly') {
            data.weekday = Number(document.getElementById('note-weekday').value);
        } else if (calendar === 'lunar') {
            const lunar = Lunar.fromDate(date);
            data.year = lunar.getYear();
            data.month = Number(document.getElementById('note-lunar-month').value);
            data.day = Number(document.getElementById('note-lunar-day').value);
        } else {
            data.year = date.getFullYear();
            data.month = date.getMonth() + 1;
            data.day = date.getDate();
        }

        const saved = this.editingNoteId
            ? this.noteStore.update(this.editingNoteId, data)
            : this.noteStore.add(data);
        if (!saved) return;

        this.editingNoteId = null;
        textInput.value = '';
        this._syncEditUi();
        this.renderNoteManageList();
        this.showDayDetails(date);
        this.renderCalendar();
    }

    renderNoteManageList() {
        const listBox = document.getElementById('note-manage-list');
        listBox.textContent = '';

        const notes = this.noteStore.all();
        if (notes.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'settings-hint';
            empty.textContent = '还没有备注';
            listBox.appendChild(empty);
            return;
        }

        notes.forEach(note => {
            const row = document.createElement('div');
            row.className = 'note-manage-item';
            if (note.id === this.editingNoteId) row.classList.add('editing');

            const info = document.createElement('div');
            info.className = 'note-manage-info';

            const text = document.createElement('div');
            text.className = 'note-manage-text';
            text.textContent = note.text;

            const rule = document.createElement('div');
            rule.className = 'note-manage-rule';
            rule.textContent = NoteStore.describe(note);

            info.appendChild(text);
            info.appendChild(rule);

            const editBtn = this._createNoteAction('编辑', 'note-edit-option', () => {
                this._startNoteEdit(note);
            });

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'note-remove';
            removeBtn.textContent = '×';
            removeBtn.setAttribute('aria-label', '删除备注');
            removeBtn.addEventListener('click', () => {
                this.noteStore.remove(note.id);
                if (this.editingNoteId === note.id) {
                    this.editingNoteId = null;
                    document.getElementById('note-text').value = '';
                    this._syncEditUi();
                }
                this.renderNoteManageList();
                this.renderCalendar();
                if (this.selectedDateKey) {
                    this.showDayDetails(this._dateFromKey(this.selectedDateKey));
                }
            });

            row.appendChild(info);
            row.appendChild(editBtn);
            row.appendChild(removeBtn);
            listBox.appendChild(row);
        });
    }

    _createNoteAction(label, className, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = className;
        btn.textContent = label;
        btn.addEventListener('click', onClick);
        return btn;
    }

    /**
     * 把已有备注回填到表单，保存时更新原备注
     */
    _startNoteEdit(note) {
        this.editingNoteId = note.id;
        this.noteForm.calendar = note.calendar;
        this.noteForm.repeat = note.repeat;

        document.getElementById('note-text').value = note.text;
        document.getElementById('note-weekday').value = String(note.weekday ?? 0);
        document.getElementById('note-date').value = NoteStore.toKey(this._noteBaseDate(note));

        this._syncEditUi();
        this._syncNoteForm(true);

        if (note.calendar === 'lunar' && note.year) {
            this._fillLunarMonthOptions(note.year);
            document.getElementById('note-lunar-month').value = String(note.month);
            document.getElementById('note-lunar-day').value = String(note.day);
            this._updateCalendarHint();
        }

        this.renderNoteManageList();
        document.getElementById('note-text').focus();
    }

    _noteBaseDate(note) {
        if (note.year && note.month && note.day) {
            if (note.calendar === 'lunar') {
                try {
                    const solar = Lunar.fromYmd(note.year, note.month, note.day).getSolar();
                    return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay());
                } catch (e) {
                    // 农历日期不存在时退回当前选中日期
                }
            } else {
                return new Date(note.year, note.month - 1, note.day);
            }
        }
        return this.selectedDateKey ? this._dateFromKey(this.selectedDateKey) : new Date();
    }

    _syncEditUi() {
        const editing = Boolean(this.editingNoteId);
        document.getElementById('note-add').textContent = editing ? '保存修改' : '添加备注';
        document.getElementById('note-cancel-edit').hidden = !editing;
    }

    _cancelEdit() {
        this.editingNoteId = null;
        document.getElementById('note-text').value = '';
        this._syncEditUi();
        this.renderNoteManageList();
    }

    exportNotes() {
        if (this.noteStore.count() === 0) {
            alert('还没有备注可导出');
            return;
        }

        const blob = new Blob([this.noteStore.exportJSON()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `日历备注备份-${NoteStore.toKey(new Date())}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    importNotes(file, inputElement) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const added = this.noteStore.importJSON(String(reader.result));
                this.renderNoteManageList();
                if (this.selectedDateKey) {
                    this.showDayDetails(this._dateFromKey(this.selectedDateKey));
                }
                this.renderCalendar();
                alert(added > 0 ? `已导入 ${added} 条备注` : '没有新增备注（可能都已经存在）');
            } catch (e) {
                alert('导入失败：' + e.message);
            } finally {
                inputElement.value = '';
            }
        };
        reader.onerror = () => {
            alert('文件读取失败');
            inputElement.value = '';
        };
        reader.readAsText(file);
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
            this.showDayDetails(this.viewDate);
            this.render();
        }
    }

    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }

    handleKeyboardNavigation(e) {
        // 设置面板打开时，只响应 Esc 关闭
        const settingsOverlay = document.getElementById('settings-overlay');
        if (!settingsOverlay.hidden) {
            if (e.key === 'Escape') {
                e.preventDefault();
                settingsOverlay.hidden = true;
            }
            return;
        }

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