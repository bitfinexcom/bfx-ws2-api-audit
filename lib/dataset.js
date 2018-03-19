'use strict'

const debug = require('debug')
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
 * Maintains an up-to-date testing dataset, synchronised via ws2.
 * All data is scoped to the provided symbol
 */
module.exports = class Dataset {
  constructor (symbol, ws, label) {
    this._cbgid = Date.now()
    this._symbol = symbol
    this._ws = ws
    this._debug = debug(`bfx:ws2-api-audit:dataset:${label}`)

    this.resetData()
  }

  resetData () {
    this._walletUpdates = {}
    this._walletSnapshots = {}
    this._orders = {} // keyed by order ID
    this._orderBook = new OrderBook()
    this._ticker = new Ticker()

    this.refreshSnapshots()
  }

  subscribeChannels () {
    this._ws.subscribeTicker(this._symbol)
    this._ws.subscribeOrderBook(this._symbol)
  }

  unsubscribeChannels () {
    this._ws.unsubscribeTicker(this._symbol)
    this._ws.unsubscribeOrderBook(this._symbol)
  }

  registerListeners () {
    const cbGID = this._cbgid
    const symbol = this._symbol

    this._ws.onTicker({ symbol, cbGID }, this._onTickerPacket.bind(this))
    this._ws.onOrderSnapshot({ cbGID }, this._onOrderSnapshotPacket.bind(this))
    this._ws.onWalletSnapshot({ cbGID }, this._onWalletSnapshotPacket.bind(this))
    this._ws.onWalletUpdate({ cbGID }, this._onWalletUpdatePacket.bind(this))
    this._ws.onOrderBook({ cbGID, symbol }, this._onOrderBook.bind(this))
    this._ws.onOrderNew({ cbGID, symbol }, this._onOrderPacket.bind(this, 'on'))
    this._ws.onOrderUpdate({ cbGID, symbol }, this._onOrderPacket.bind(this, 'ou'))
    this._ws.onOrderClose({ cbGID, symbol }, this._onOrderPacket.bind(this, 'oc'))
  }

  unregisterListeners () {
    this._ws.removeListeners(this._cbgid)
  }

  _onTickerPacket (ticker = []) {
    this._ticker = Ticker.unserialize(ticker)
    this._debug('recv ticker (last %f)', this._ticker.lastPrice)
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
        'internal order snapshot (%d/%d): %f @ %f type %s (%s)',
        i + 1, orderObjects.length, o.amount, o.price, o.type, o.status
      )
    })
  }

  _onOrderBook (ob = []) {
    if (Array.isArray(ob[0])) {
      this._debug('recv ob snap: %j', ob)
      this._orderBook = new OrderBook(ob)
    } else {
      this._debug('recv ob update with: %j', ob)
      this._orderBook.updateWith(ob)
    }

    this._debug('recv ob snap/update (mid %f)', this._orderBook.midPrice())
  }

  updateOrderBookSnapshot () {
    this._orderBookSnapshot = new OrderBook(this._orderBook)
  }

  getOrderBookSnapshot () {
    return this._orderBookSnapshot
  }

  getOrderBook () {
    return this._orderBook
  }

  midPrice () {
    return this._orderBook.midPrice()
  }

  lastPrice () {
    return this._ticker.lastPrice
  }

  refreshSnapshots () {
    this.clearWalletHistory()
    this.updateOrderBookSnapshot()

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
