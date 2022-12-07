import NavBar from './NavBar'
import logger from '../lib/logger'
import Tool from './Tool'
import Settings from '../Settings/Settings'
import Emitter from 'licia/Emitter'
import isMobile from 'licia/isMobile'
import defaults from 'licia/defaults'
import keys from 'licia/keys'
import last from 'licia/last'
import each from 'licia/each'
import isNum from 'licia/isNum'
import $ from 'licia/$'
import toNum from 'licia/toNum'
import isDarkMode from 'licia/isDarkMode'
import extend from 'licia/extend'
import evalCss from '../lib/evalCss'
import { isDarkTheme } from '../lib/themes'
import LunaNotification from 'luna-notification'
import LunaModal from 'luna-modal'
import { classPrefix as c } from '../lib/util'

export default class DevTools extends Emitter {
  constructor($container, { defaults = {} } = {}) {
    super()

    this._defCfg = extend(
      {
        transparency: 1,
        displaySize: 80,
        theme: isDarkMode() ? 'Dark' : 'Light',
      },
      defaults
    )

    this._style = evalCss(require('./DevTools.scss'))

    this.$container = $container
    this._isShow = false
    this._opacity = 1
    this._tools = {}
    this._isResizing = false
    this._resizeTimer = null
    this._resizeStartY = 0
    this._resizeStartSize = 0

    this._appendTpl()
    this._initNavBar()
    this._initNotification()
    this._initModal()
    this._bindEvent()
  }
  show() {
    this._isShow = true

    this._$el.show()
    this._navBar.resetBottomBar()

    // Need a delay after show to enable transition effect.
    setTimeout(() => {
      this._$el.css('opacity', this._opacity)
    }, 50)

    this.emit('show')

    return this
  }
  hide() {
    this._isShow = false
    this.emit('hide')

    this._$el.css({ opacity: 0 })
    setTimeout(() => this._$el.hide(), 300)

    return this
  }
  toggle() {
    return this._isShow ? this.hide() : this.show()
  }
  add(tool) {
    if (!(tool instanceof Tool)) {
      const { init, show, hide, destroy } = new Tool()
      defaults(tool, { init, show, hide, destroy })
    }

    let name = tool.name
    if (!name) return logger.error('You must specify a name for a tool')
    name = name.toLowerCase()
    if (this._tools[name]) return logger.warn(`Tool ${name} already exists`)

    this._$tools.prepend(
      `<div id="${c(name)}" class="${c(name + ' tool')}"></div>`
    )
    tool.init(this._$tools.find(`.${c(name)}.${c('tool')}`), this)
    tool.active = false
    this._tools[name] = tool

    this._navBar.add(name)

    return this
  }
  remove(name) {
    const tools = this._tools

    if (!tools[name]) return logger.warn(`Tool ${name} doesn't exist`)

    this._navBar.remove(name)

    const tool = tools[name]
    delete tools[name]
    if (tool.active) {
      const toolKeys = keys(tools)
      if (toolKeys.length > 0) this.showTool(tools[last(toolKeys)].name)
    }
    tool.destroy()

    return this
  }
  removeAll() {
    each(this._tools, (tool) => this.remove(tool.name))

    return this
  }
  get(name) {
    const tool = this._tools[name]

    if (tool) return tool
  }
  showTool(name) {
    if (this._curTool === name) return this
    this._curTool = name

    const tools = this._tools

    const tool = tools[name]
    if (!tool) return

    let lastTool = {}

    each(tools, (tool) => {
      if (tool.active) {
        lastTool = tool
        tool.active = false
        tool.hide()
      }
    })

    tool.active = true
    tool.show()

    this._navBar.activateTool(name)

    this.emit('showTool', name, lastTool)

    return this
  }
  initCfg(settings) {
    const cfg = (this.config = Settings.createCfg('dev-tools', this._defCfg))

    this._setTransparency(cfg.get('transparency'))
    this._setDisplaySize(cfg.get('displaySize'))
    this._setTheme(cfg.get('theme'))

    cfg.on('change', (key, val) => {
      switch (key) {
        case 'transparency':
          return this._setTransparency(val)
        case 'displaySize':
          return this._setDisplaySize(val)
        case 'theme':
          return this._setTheme(val)
      }
    })

    settings
      .separator()
      .select(cfg, 'theme', 'Theme', keys(evalCss.getThemes()))
      .range(cfg, 'transparency', 'Transparency', {
        min: 0.2,
        max: 1,
        step: 0.01,
      })
      .range(cfg, 'displaySize', 'Display Size', {
        min: 40,
        max: 100,
        step: 1,
      })
      .separator()
  }
  notify(content, options) {
    this._notification.notify(content, options)
  }
  destroy() {
    evalCss.remove(this._style)
    this.removeAll()
    this._navBar.destroy()
    this._$el.remove()
  }
  _setTheme(theme) {
    const { $container } = this

    if (isDarkTheme(theme)) {
      $container.addClass(c('dark'))
    } else {
      $container.rmClass(c('dark'))
    }
    evalCss.setTheme(theme)
  }
  _setTransparency(opacity) {
    if (!isNum(opacity)) return

    this._opacity = opacity
    if (this._isShow) this._$el.css({ opacity })
  }
  _setDisplaySize(height) {
    if (!isNum(height)) return

    this._$el.css({ height: height + '%' })
  }
  _appendTpl() {
    const $container = this.$container

    $container.append(
      c(`
      <div class="dev-tools">
        <div class="resizer"></div>
        <div class="nav-bar-container">
          <div class="nav-bar"></div>
          <div class="bottom-bar"></div>
        </div>
        <div class="tools"></div>
        <div class="notification"></div>
        <div class="modal"></div>
      </div>
      `)
    )

    this._$el = $container.find(c('.dev-tools'))
    this._$tools = this._$el.find(c('.tools'))
  }
  _initNavBar() {
    this._navBar = new NavBar(this._$el.find(c('.nav-bar-container')))
    this._navBar.on('showTool', (name) => this.showTool(name))
  }
  _initNotification() {
    this._notification = new LunaNotification(
      this._$el.find(c('.notification')).get(0),
      {
        position: {
          x: 'center',
          y: 'top',
        },
      }
    )
  }
  _initModal() {
    LunaModal.setContainer(this._$el.find(c('.modal')).get(0))
  }
  _bindEvent() {
    const $resizer = this._$el.find(c('.resizer'))
    const $navBar = this._$el.find(c('.nav-bar'))
    const $root = $(document.documentElement)

    const startListener = (e) => {
      e.preventDefault()
      e.stopPropagation()

      e = e.origEvent
      this._isResizing = true
      this._resizeStartSize = this.config.get('displaySize')
      this._resizeStartY = getClientY(e)

      $resizer.css('height', '100%')

      if (isMobile()) {
        $root.on('touchmove', moveListener)
        $root.on('touchend', endListener)
      } else {
        $root.on('mousemove', moveListener)
        $root.on('mouseup', endListener)
      }
    }
    const moveListener = (e) => {
      if (!this._isResizing) {
        return
      }
      e.preventDefault()
      e.stopPropagation()

      e = e.origEvent
      const deltaY =
        ((this._resizeStartY - getClientY(e)) / window.innerHeight) * 100
      let displaySize = this._resizeStartSize + deltaY
      if (displaySize < 40) {
        displaySize = 40
      } else if (displaySize > 100) {
        displaySize = 100
      }
      this.config.set('displaySize', toNum(displaySize.toFixed(2)))
    }
    const endListener = () => {
      clearTimeout(this._resizeTimer)
      this._isResizing = false

      $resizer.css('height', 10)

      if (isMobile()) {
        $root.off('touchmove', moveListener)
        $root.off('touchend', endListener)
      } else {
        $root.off('mousemove', moveListener)
        $root.off('mouseup', endListener)
      }
    }
    $resizer.css('height', 10)
    const getClientY = (e) => {
      if (e.clientY) return e.clientY

      if (e.touches) return e.touches[0].clientY

      return 0
    }
    $navBar.on('contextmenu', (e) => e.preventDefault())
    if (isMobile()) {
      $resizer.on('touchstart', startListener)
    } else {
      $resizer.on('mousedown', startListener)
    }
  }
}
