'use strict'

const debug = require('debug')('bfx-ws2-api-audit:assert:order')
const debugV = require('debug')('bfx-ws2-api-audit:assert:order:verbose')
const { getWalletKey } = require('../dataset.utils')

const M_FEE = 0.001
const T_FEE = 0.002
const M_FEE_M = 1 - M_FEE
const T_FEE_M = 1 - T_FEE
const DUST = { // TODO: revise, min deltas for balance equality
  IOT: 0.01,
  ETH: 0.0001
}

module.exports = {
  assertNotFilled (o) {
    debug('assert not filled (a: %f, aO: %f)', o.amount, o.amountOrig)
    if (o.amount === o.amountOrig) return
    throw new Error('order partially or fully filled: ' + o.serialize())
  },

  assertPartiallyFilled (o) {
    debug('assert partially filled (a: %f, aO: %f)', o.amount, o.amountOrig)
    if (o.amount !== 0 && o.amount < o.amountOrig) return
    throw new Error('order not partially filled: ' + o.serialize())
  },

  assertFullyFilled (o) {
    debug('assert fully filled (a: %f, aO: %f)', o.amount, o.amountOrig)
    if (o.amount === 0) return
    throw new Error('order not fully filled: ' + o.serialize())
  },

  /**
   * Scans received wallet update packets, and verifies that the order and
   * associated fees have been applied
   *
   * @param {Order} o 
   * @param {Dataset} dataset
   * @return {boolean} ok - true if there is a matching balance update
   */
  assertWalletsUpdated (o, dataset) {
    const wu = dataset.getWalletUpdates()
    const wType = o.type.indexOf('EXCHANGE') !== -1 ? 'exchange' : 'margin'

    // Resolve base/quote wallets
    const qCurrency = o.getQuoteCurrency()
    const bCurrency = o.getBaseCurrency()
    const fCurrency = o.amount > 0 ? qCurrency : bCurrency
    const qwid = getWalletKey({ type: wType, currency: qCurrency })
    const bwid = getWalletKey({ type: wType, currency: bCurrency })
    const fwid = getWalletKey({ type: wType, currency: fCurrency })
    const qw = dataset.getWalletSnapshot(qwid)
    const bw = dataset.getWalletSnapshot(bwid)
    const fw = dataset.getWalletSnapshot(fwid)
    const onv = Math.abs(+o.price * +o.amountOrig)

    if (!bw) throw new Error(`missing wallet snapshot for ${bwid}`)
    if (!qw) throw new Error(`missing wallet snapshot for ${qwid}`)
    if (!fw) throw new Error(`missing wallet snapshot for ${fwid}`)

    debugV('qw.balance: %f [%s]', qw.balance, qwid)
    debugV('bw.balance: %f [%s]', bw.balance, bwid)
    debugV('fw.balance: %f [%s]', fw.balance, fwid)
    debugV('onv: %f [%s]', onv, qCurrency)

    let bBalance = bw.balance
    let qBalance = qw.balance

    if (o.amount > 0) {
      debugV('expect %s: %f', bCurrency, o.amount * -1)
      debugV('expect %s: +%f', qCurrency, onv)
      debugV('expect fee %s: -%f', fCurrency, onv * M_FEE)

      bBalance -= +o.amount
      qBalance += onv
    } else {
      debugV('expect %s: +%f', bCurrency, o.amount * -1)
      debugV('expect %s: -%f', qCurrency, onv)
      debugV('expect fee %s: -%f', fCurrency, onv * M_FEE)

      bBalance += +o.amount
      qBalance -= onv
    }

    if (fCurrency === qCurrency) {
      qBalance -= onv * M_FEE
    } else {
      bBalance -= onv * M_FEE
    }

    let u
    let walletsOK = 0 // +1 for each
    const m = o.amount > 0 ? 1 : -1

    for (let i = 0; i < wu.length; i += 1) {
      if (walletsOK === 2) break

      u = wu[i]
      if (u.type !== wType) continue

      if (u.currency === qCurrency) {
        if (Math.abs(+u.balance - qBalance) < DUST[qCurrency]) {
          walletsOK++
          continue
        }
      } else if (u.currency === bCurrency) {
        if (Math.abs(+u.balance - bBalance) < DUST[bCurrency]) {
          walletsOK++
          continue
        }
      }
    }
    
    if (!walletsOK === 2) {
      throw new Error('wu packet not found for order') // info log'ed above
    }
  }
}
