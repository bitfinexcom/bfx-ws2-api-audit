'use strict'

const debug = require('debug')
const Promise = require('bluebird')
const _flatten = require('lodash/flatten')
const _last = require('lodash/last')

const {
  Ticker, Wallet, Order, OrderBook
} = require('bitfinex-api-node/lib/models')

const delayPromise = require('./util/delay_promise')
const { getWalletKey } = require('./dataset.utils')

let _cid = Date.now()
const cid = () => _cid++

/**
 * Maintains an up-to-date testing dataset, synchronised via ws2. Order books,
 * ticker data, and wallet updates are tracked.
 *
 * TODO: Trades, candles, all other packets..
 */
module.exports = class Dataset {
  constructor (symbols = [], ws, label) {
    this._cbgid = Date.now()
    this._symbols = symbols
    this._ws = ws
    this._debug = debug(`bfx:ws2-api-audit:dataset:${label}`)
    this._tickerPromises = {}
    this._obPromises = {}
    this.resetData()

    this._debug('init with symbols: %s', symbols.join(', '))
  }

  resetData () {
    this._walletUpdates = {}
    this._walletSnapshots = {}
    this._orders = {} // keyed by order ID
    this._orderBooks = {}
    this._orderBookSnapshots = {}
    this._tickers = {}
    this._tickerPromises = {}
    this._obPromises = {}

    this.refreshSnapshots()
  }

  subscribeChannels () {
    this._symbols.forEach(sym => {
      this._ws.subscribeTicker(sym)
      this._ws.subscribeOrderBook(sym, 'P0', 250)
    })
  }

  unsubscribeChannels () {
    this._symbols.forEach(sym => {
      this._ws.unsubscribeTicker(sym)
      this._ws.unsubscribeOrderBook(sym)
    })
  }

  registerListeners () {
    const cbGID = this._cbgid

    this._ws.onOrderSnapshot({ cbGID }, this._onOrderSnapshotPacket.bind(this))
    this._ws.onWalletSnapshot({ cbGID }, this._onWalletSnapshotPacket.bind(this))
    this._ws.onWalletUpdate({ cbGID }, this._onWalletUpdatePacket.bind(this))

    this._symbols.forEach(symbol => {
      const cbData = { cbGID, symbol }

      this._ws.onTicker(cbData, this._onTickerPacket.bind(this, symbol))
      this._ws.onOrderBook(cbData, this._onOrderBook.bind(this, symbol))
      this._ws.onOrderNew(cbData, this._onOrderPacket.bind(this, 'on'))
      this._ws.onOrderUpdate(cbData, this._onOrderPacket.bind(this, 'ou'))
      this._ws.onOrderClose(cbData, this._onOrderPacket.bind(this, 'oc'))
    })
  }

  unregisterListeners () {
    this._ws.removeListeners(this._cbgid)
  }

  delayUntilOrderBook (symbol) {
    if (this._orderBooks[symbol]) {
      return Promise.resolve(this._orderBooks[symbol])
    }

    if (!this._obPromises[symbol]) {
      this._obPromises[symbol] = []
    }

    return new Promise((resolve) => {
      this._obPromises[symbol].push(resolve)
    })
  }

  awaitTicker (symbol, extraDelay = 0) {
    if (!this._tickerPromises[symbol]) {
      this._tickerPromises[symbol] = []
    }

    return new Promise((resolve) => {
      this._debug('awaiting ticker %s', symbol)
      this._tickerPromises[symbol].push(resolve)
    }).then(() => {
      if (extraDelay === 0) {
        return
      }

      return new Promise((resolve) => {
        setTimeout(() => resolve(), extraDelay)
      })
    })
  }

  _onTickerPacket (symbol, ticker = []) {
    const t = Ticker.unserialize(ticker)

    this._tickers[symbol] = t
    this._debug('recv ticker for %s (last %f)', symbol, t.lastPrice)

    if (this._tickerPromises[symbol]) {
      this._tickerPromises[symbol].forEach(res => res(t))
      delete this._tickerPromises[symbol]
    }
  }

  _onOrderSnapshotPacket (snap = []) {
    this._orders = {}

    snap.forEach((oRaw, i) => {
      const o = new Order(oRaw)
      this._orders[o.id] = o

      this._debug(
        '%d/%d recv os order: %f @ %f %s (%s)',
        i + 1, snap.length, o.amount, o.price, o.type, o.status
      )
    })
  }

  _onWalletSnapshotPacket (snap = []) {
    const wallets = Wallet.unserialize(snap)

    this._walletSnapshots = {}
    this._walletUpdates = {}

    wallets.forEach(w => {
      const key = getWalletKey(w)

      w.delta = 0

      this._walletSnapshots[key] = w
      this._walletUpdates[key] = [w]

      this._debug('recv ws %s: %f', key, w.balance)
    })
  }

  _onWalletUpdatePacket (packet = []) {
    const wallet = Wallet.unserialize(packet)
    const key = getWalletKey(wallet)

    if (!Array.isArray(this._walletUpdates[key])) {
      throw new Error('received update for unknown wallet')
    }

    const updates = this._walletUpdates[key]
    const u = {
      ...wallet,

      delta: wallet.balance - _last(updates).balance,
      mts: cid()
    }

    updates.push(u)
    this._debug('recv wu [%s: %f %d]', key, u.balance, u.mts)
  }

  _onOrderPacket (type, oRaw) {
    const o = new Order(oRaw)
    this._orders[o.id] = o

    this._debug(
      'recv %s: ID %d (%s) %f @ %f type %s (%s)',
      type, o.id, o.amount, o.amountOrig, o.price, o.type, o.status
    )

    const orderObjects = Object.values(this._orders)

    orderObjects.forEach((o, i) => {
      this._debug(
        'internal order snapshot (%d/%d): %d %f @ %f type %s (%s)',
        i + 1, orderObjects.length, o.id, o.amount, o.price, o.type, o.status
      )
    })

    /*
    const ob = this._orderBooks[o.symbol]

    if (ob) {
      for (let i = 0; i < 4; i += 1) {
        if (!ob.bids[i]) break

        this._debug(
          'OB %s bid %d: %f @ %f (%d)',
          o.symbol, i, ob.bids[i][2], ob.bids[i][0], ob.bids[i][1]
        )
      }

      for (let i = 0; i < 4; i += 1) {
        if (!ob.asks[i]) break

        this._debug(
          'OB %s ask %d: %f @ %f (%d)',
          o.symbol, i, ob.asks[i][2], ob.asks[i][0], ob.asks[i][1]
        )
      }
    }
    */
  }

  _onOrderBook (symbol, ob = []) {
    if (ob.length === 0 || Array.isArray(ob[0])) {
      this._debug('recv ob snap: %j', ob)
      this._orderBooks[symbol] = new OrderBook(ob)
    } else {
      this._debug('recv ob update with: %j', ob)

      const oldMid = this._orderBooks[symbol].midPrice()
      this._orderBooks[symbol].updateWith(ob)
      const newMid = this._orderBooks[symbol].midPrice()

      if (oldMid !== newMid) {
        this._debug('new mid price: %f', newMid)
      }
    }

    this._debug(
      'recv ob snap/update for %s (mid %f)',
      symbol, this._orderBooks[symbol].midPrice()
    )

    if (this._obPromises[symbol]) {
      this._obPromises[symbol].forEach(res => res(ob))
      delete this._obPromises[symbol]
    }
  }

  /**
   * Use the current OB state as the OB snapshot for the specified symbol, or
   * all symbols
   *
   * @param {string?} symbol - optional, if missing all OB snapshots are updated
   */
  updateOrderBookSnapshot (symbol) {
    if (symbol) {
      this._orderBookSnapshots[symbol] = new OrderBook(this._orderBooks[symbol])
      return
    }

    // Update all
    Object.keys(this._orderBooks).forEach(sym => {
      this._orderBookSnapshots[sym] = new OrderBook(this._orderBooks[sym])
    })
  }

  getOrderBookSnapshot (symbol) {
    return this._orderBookSnapshots[symbol]
  }

  getOrderBook (symbol) {
    return this._orderBooks[symbol]
  }

  midPrice (symbol) {
    return this._orderBooks[symbol].midPrice()
  }

  lastPrice (symbol) {
    return this._tickers[symbol].lastPrice
  }

  /**
   * @param {string?} symbol - optional, refreshes all OBs if missing
   */
  refreshSnapshots (symbol) {
    this.clearWalletHistory()
    this.updateOrderBookSnapshot(symbol)

    this._debug('refreshed snapshots')
  }

  clearWalletHistory () {
    Object.keys(this._walletSnapshots).forEach(key => {
      const wu = _last(this._walletUpdates[key] || [])

      if (wu) {
        this._walletSnapshots[key] = wu
        this._walletUpdates[key] = [wu]

        this._debug('refresh ws %s: %f', key, wu.balance)
      } else { // sanity logic
        delete this._walletSnapshots[key]
        delete this._walletUpdates[key]
      }
    })
  }

  getAllWalletKeys () {
    return Object.keys(this._walletUpdates)
  }

  getAllWalletUpdates () {
    return _flatten(Object
      .keys(this._walletUpdates)
      .map(k => this._walletUpdates[k])
    )
  }

  getWalletUpdates (key = '') {
    return this._walletUpdates[key]
  }

  getAllWalletSnapshots () {
    return this._walletSnapshots
  }

  getWalletSnapshot (key = '') {
    return this._walletSnapshots[key]
  }

  /**
   * Tries to find the order in our local cache & copies cached values over it
   *
   * @param {Order} o 
   * @return {boolean} updated
   */
  updateOrder (o) {
    const { cid } = o
    const orders = Object.values(this._orders)

    for (let i = 0; i < orders.length; i += 1) {
      if (orders[i].cid === cid) {
        Object.assign(o, orders[i].toJS())
        return true
      }
    }

    return false
  }

  getOrders () {
    return this._orders
  }

  cancelAllOpenOrders (dataDelay = 3000) {
    const openOrders = Object.values(this._orders).filter(({ status }) => (
      status.indexOf('EXECUTED') === -1 && status.indexOf('CANCELED') === -1
    ))

    return delayPromise(this._ws.cancelOrders(openOrders), dataDelay)
  }

  getStopForOCO (oco) {
    const { id } = oco

    return Object.values(this._orders).find(o => o.placedId === id)
  }
}
