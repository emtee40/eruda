import Tool from '../DevTools/Tool';
import Settings from '../Settings/Settings';
import Masonry from 'masonry-layout';
import {
    evalCss, 
    $, 
    unique, 
    safeStorage, 
    each,
    isStr,
    startWith,
    trim,
    orientation,
    isCrossOrig,
    ajax,
    SafeMutationObserver,
    isErudaEl,
    toArr,
    concat,
    cookie
} from '../lib/util';

export default class Resources extends Tool
{
    constructor()
    {
        super();

        this._style = evalCss(require('./Resources.scss'));

        this.name = 'resources';
        this._localStoreData = [];
        this._hideErudaSetting = false;
        this._sessionStoreData = [];
        this._cookieData = [];
        this._scriptData = [];
        this._stylesheetData = [];
        this._imageData = [];
        this._observeElement = true;
        this._tpl = require('./Resources.hbs');
    }
    init($el, container)
    {
        super.init($el);

        this._container = container;

        this.refresh();
        this._bindEvent();
        this._initObserver();
        this._initCfg();
    }
    refresh()
    {
        return this.refreshLocalStorage()
                   .refreshSessionStorage()
                   .refreshCookie()
                   .refreshScript()
                   .refreshStylesheet()
                   .refreshImage()._render();
    }
    destroy() 
    {
        super.destroy();

        this._disableObserver();
        evalCss.remove(this._style);
    }
    refreshScript()
    {
        let scriptData = [];

        $('script').each(function ()
        {
            let src = this.src;

            if (src !== '') scriptData.push(src);
        });

        scriptData = unique(scriptData);

        this._scriptData = scriptData;

        return this;
    }
    refreshStylesheet()
    {
        let stylesheetData = [];

        $('link').each(function ()
        {
            if (this.rel !== 'stylesheet') return;

            stylesheetData.push(this.href);
        });

        stylesheetData = unique(stylesheetData);

        this._stylesheetData = stylesheetData;

        return this;
    }
    refreshLocalStorage()
    {
        this._refreshStorage('local');

        return this;
    }
    refreshSessionStorage()
    {
        this._refreshStorage('session');

        return this;
    }
    _refreshStorage(type)
    {
        let store = safeStorage(type, false);

        if (!store) return;

        let storeData = [];

        // Mobile safari is not able to loop through localStorage directly.
        store = JSON.parse(JSON.stringify(store));

        each(store, (val, key) =>
        {
            // According to issue 20, not all values are guaranteed to be string.
            if (!isStr(val)) return;

            if (this._hideErudaSetting)
            {
                if (startWith(key, 'eruda') || key === 'active-eruda') return;
            }

            storeData.push({
                key: key,
                val: sliceStr(val, 200)
            });
        });

        this['_' + type + 'StoreData'] = storeData;
    }
    refreshCookie()
    {
        let cookieData = [];

        let cookie = document.cookie;
        if (trim(cookie) !== '')
        {
            each(document.cookie.split(';'), function (val, t)
            {
                val = val.split('=');
                try
                {
                    t = decodeURIComponent(val[1]);
                } catch(e)
                {
                    t = val[1];
                }
                cookieData.push({
                    key: trim(val[0]),
                    val: t
                });
            });
        }

        this._cookieData = cookieData;

        return this;
    }
    refreshImage()
    {
        let imageData = [];

        let performance = this._performance = window.webkitPerformance || window.performance;
        if (performance && performance.getEntries) 
        {
            let entries = this._performance.getEntries();
            entries.forEach(entry =>
            {
                if (entry.initiatorType === 'img' || isImg(entry.name)) 
                {
                    imageData.push(entry.name);
                } 
            });
        } else 
        {
            $('img').each(function ()
            {
                let $this = $(this),
                    src = $this.attr('src');

                if ($this.data('exclude') === 'true') return;

                imageData.push(src);
            });
        }


        imageData = unique(imageData);
        imageData.sort();
        this._imageData = imageData;

        return this;
    }
    show()
    {
        super.show();
        if (this._observeElement) this._enableObserver();

        return this.refresh();
    }
    hide() 
    {
        this._disableObserver();

        return super.hide();
    }
    _bindEvent()
    {
        let self = this,
            $el = this._$el,
            container = this._container;

        $el.on('click', '.eruda-refresh-local-storage', () => this.refreshLocalStorage()._render())
           .on('click', '.eruda-refresh-session-storage', () => this.refreshSessionStorage()._render())
           .on('click', '.eruda-refresh-cookie', () => this.refreshCookie()._render())
           .on('click', '.eruda-refresh-script', () => this.refreshScript()._render())
           .on('click', '.eruda-refresh-image', () => this.refreshImage()._render())
           .on('click', '.eruda-delete-storage', function ()
           {
               let $this = $(this),
                   key = $this.data('key'),
                   type = $this.data('type');

               if (type === 'local')
               {
                   localStorage.removeItem(key);
                   self.refreshLocalStorage()._render();
               } else
               {
                   sessionStorage.removeItem(key);
                   self.refreshSessionStorage()._render();
               }
           })
           .on('click', '.eruda-delete-cookie', function ()
           {
               let key = $(this).data('key');

               delCookie(key);
               self.refreshCookie()._render();
           })
           .on('click', '.eruda-clear-storage', function ()
           {
               let type = $(this).data('type');

               if (type === 'local')
               {
                   each(self._localStoreData, val => localStorage.removeItem(val.key));
                   self.refreshLocalStorage()._render();
               } else
               {
                   each(self._sessionStoreData, val => sessionStorage.removeItem(val.key));
                   self.refreshSessionStorage()._render();
               }
           })
           .on('click', '.eruda-clear-cookie', () =>
           {
               each(this._cookieData, val => delCookie(val.key));
               this.refreshCookie()._render();
           })
           .on('click', '.eruda-storage-val', function ()
           {
               let $this = $(this),
                   key = $this.data('key'),
                   type = $this.data('type');

               let val = type === 'local' ? localStorage.getItem(key) : sessionStorage.getItem(key);

               try
               {
                   showSources('json', JSON.parse(val));
               } catch(e)
               {
                   showSources('raw', val);
               }
           })
           .on('click', '.eruda-img-link', function ()
           {
               let src = $(this).attr('src');

               showSources('img', src);
           })
           .on('click', '.eruda-css-link', linkFactory('css'))
           .on('click', '.eruda-js-link', linkFactory('js'));

        orientation.on('change', () => this._render());

        function showSources(type, data)
        {
            let sources = container.get('sources');
            if (!sources) return;

            sources.set(type, data);

            container.showTool('sources');

            return true;
        }

        function linkFactory(type)
        {
            return function (e)
            {
                if (!container.get('sources')) return;
                e.preventDefault();

                let url = $(this).attr('href');

                if (!isCrossOrig(url))
                {
                    return ajax({
                        url,
                        success: data =>
                        {
                            showSources(type, data);
                        },
                        dataType: 'raw'
                    });
                } else
                {
                    showSources('iframe', url);
                }
            };
        }
    }
    _initCfg()
    {
        let cfg = this.config = Settings.createCfg('resources', {
            hideErudaSetting: true,
            observeElement: true
        });

        if (cfg.get('hideErudaSetting')) this._hideErudaSetting = true;
        if (!cfg.get('observeElement')) this._observeElement = false;

        cfg.on('change', (key, val) =>
        {
            switch (key)
            {
                case 'hideErudaSetting': this._hideErudaSetting = val; return;
                case 'observeElement': 
                    this._observeElement = val;
                    return val ? this._enableObserver() : this._disableObserver();
            }
        });

        let settings = this._container.get('settings');
        settings.text('Resources')
                .switch(cfg, 'hideErudaSetting', 'Hide Eruda Setting')
                .switch(cfg, 'observeElement', 'Auto Refresh Elements')
                .separator();
    }
    _render()
    {
        let cookieData = this._cookieData,
            scriptData = this._scriptData,
            stylesheetData = this._stylesheetData,
            imageData = this._imageData;

        this._renderHtml(this._tpl({
            localStoreData: this._localStoreData,
            sessionStoreData: this._sessionStoreData,
            cookieData: cookieData,
            cookieState: getState('cookie', cookieData.length),
            scriptData: scriptData,
            scriptState: getState('script', scriptData.length),
            stylesheetData: stylesheetData,
            stylesheetState: getState('stylesheet', stylesheetData.length),
            imageData: imageData,
            imageState: getState('image', imageData.length)
        }));

        if (this._imageData.length === 0) return;

        let $imgList = this._$el.find('.eruda-image-list');

        let columnWidth = ($imgList.offset().width - 20) / 80,
            maxItemWidth = columnWidth * 20;

        $imgList.find('li').each(function ()
        {
            let $this = $(this),
                img = $this.find('img').get(0);

            let itemWidth = columnWidth,
                imgWidth = img.naturalWidth || 0;

            while (imgWidth > itemWidth && itemWidth < maxItemWidth) 
            {
                itemWidth += columnWidth;
            }

            $this.css('width', itemWidth);
        });

        new Masonry($imgList.get(0), {
            itemSelector: 'li',
            columnWidth
        });
    }
    _renderHtml(html)
    {
        if (html === this._lastHtml) return;
        this._lastHtml = html;
        this._$el.html(html);
    }
    _initObserver()
    {
        this._observer = new SafeMutationObserver(mutations =>
        {
            let needToRender = false;
            each(mutations, mutation => 
            {
                if (this._handleMutation(mutation)) needToRender = true;
            });
            if (needToRender) this._render();
        });
    }
    _handleMutation(mutation) 
    {
        if (isErudaEl(mutation.target)) return;
        
        let checkEl = el =>
        {
            let tagName = getLowerCaseTagName(el);
            switch (tagName) 
            {
                case 'script': this.refreshScript(); return true;
                case 'img': this.refreshImage(); return true;
                case 'link': this.refreshStylesheet(); return true;
            }
            
            return false;
        };

        if (mutation.type === 'attributes') 
        {
            if (checkEl(mutation.target)) return true;
        } else if (mutation.type === 'childList') 
        {
            if (checkEl(mutation.target)) return true;
            let nodes = toArr(mutation.addedNodes);
            nodes = concat(nodes, toArr(mutation.removedNodes));

            for (let node of nodes) 
            {
                if (checkEl(node)) return true;
            }
        }

        return false;
    }
    _enableObserver() 
    {
        this._observer.observe(document.documentElement, {
            attributes: true,
            childList: true,
            subtree: true
        });
    }
    _disableObserver() 
    {
        this._observer.disconnect();
    }
}

function getState(type, len)
{
    if (len === 0) return '';

    let warn = 0, danger = 0;

    switch (type)
    {
        case 'cookie': warn = 30; danger = 60; break;
        case 'script': warn = 5; danger = 10; break;
        case 'stylesheet': warn = 4; danger = 8; break;
        case 'image': warn = 50; danger = 100; break;
    }

    if (len >= danger) return 'eruda-danger';
    if (len >= warn) return 'eruda-warn';

    return 'eruda-ok';
}

let {hostname, pathname} = window.location;

function delCookie(key)
{
    let hostNames = hostname.split('.'),
        pathNames = pathname.split('/'),
        domain = '',
        pathLen = pathNames.length,
        path;

    if (del()) return;

    for (let i = hostNames.length - 1; i >= 0; i--)
    {
        let hostName = hostNames[i];
        if (hostName === '') continue;
        domain = (domain === '') ? hostName : hostName + '.' + domain ;

        path = '/';
        if (del({domain, path}) || del({domain})) return;

        for (let j = 0; j < pathLen; j++)
        {
            let pathName = pathNames[j];
            if (pathName === '') continue;

            path += pathName;
            if (del({domain, path}) || del({path})) return;

            path += '/';
            if (del({domain, path}) || del({path})) return;
        }
    }

    function del(options = {})
    {
        cookie.remove(key, options);

        return !cookie.get(key);
    }
}

function getLowerCaseTagName(el) 
{
    if (!el.tagName) return '';
    return el.tagName.toLowerCase();
}

let sliceStr = (str, len) => str.length < len ? str : str.slice(0, len) + '...';

let regImg = /\.(jpeg|jpg|gif|png)$/;

let isImg = url => regImg.test(url);
