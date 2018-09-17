'use strict'

const debug = require('debug')('bfx-ws2-api-audit:assert:orderbook')
const MAX_MATCH_DELTA_PERC = 0.0005 // for virtual OB price levels

/**
 * See assertOrderInserted & assertOrderRemoved. Does not log
 *
 * @param {Order} o 
 * @param {Dataset} dataset 
 * @param {number} direction - 1 for removed, -1 for inserted
 * @param {boolean} matchVirtual - if true, a max-delta is employed
 */
const assertOrderChanged = (o, dataset, direction, matchVirtual) => {
  if (direction !== -1 && direction !== 1) {
    throw new Error(`unkown direction: ${direction}`)
  }

  const price = +o.price
  const amount = +o.amountOrig
  const ob = dataset.getOrderBook(o.symbol)
  const obSnap = dataset.getOrderBookSnapshot(o.symbol)
  const obSide = amount > 0 ? ob.bids : ob.asks
  const obSnapSide = amount > 0 ? obSnap.bids : obSnap.asks

  let priceInNewOB = false
  let priceInOldOB = false
  let newLevel = null
  let oldLevel = null

  for (let i = 0; i < obSide.length; i += 1) {
    if (!matchVirtual && obSide[i][0] !== price) {
      continue
    } else if (matchVirtual) {
      let p = obSide[i][0] / price

      if (p > 1) {
        p -= 1
      } else {
        p = 1 - p
      }

      if (p > MAX_MATCH_DELTA_PERC) continue
    }

    priceInNewOB = true
    newLevel = obSide[i]
    break
  }

  if (!priceInNewOB && direction === 1) {
    throw new Error(`order price level not in new order book: ${price}`)
  }

  for (let i = 0; i < obSnapSide.length; i += 1) {
    if (!matchVirtual && obSnapSide[i][0] !== price) {
      continue
    } else if (matchVirtual) {
      let p = obSnapSide[i][0] / price

      if (p > 1) {
        p -= 1
      } else {
        p = 1 - p
      }

      if (p > MAX_MATCH_DELTA_PERC) continue
    }

    priceInOldOB = true
    oldLevel = obSnapSide[i]
    break
  }

  if (!priceInOldOB && direction === -1) {
    throw new Error(`order price level not in old order book: ${price}`)
  }

  if (!priceInOldOB) { // for inserts, see throw above
    debug('order price level not in old order book, match may not be exact')

    if (Math.abs(newLevel[2]) < Math.abs(amount)) {
      throw new Error('new ob price level contains less than order amount')
    }
    return
  } if (!priceInNewOB) { // for removals, see throw above
    debug('order price level not in new order book, match may not be exact')

    if (Math.abs(oldLevel[2]) < Math.abs(amount)) {
      throw new Error('old ob price level contains less than order amount')
    }
  } else {
    const delta = newLevel[2] - oldLevel[2]

    if (Math.abs(delta - (amount * direction)) > 0.0000001) {
      throw new Error(
        `ob level amount did not increase/decrease for order (${delta} < ${amount * direction})`
      )
    }
  }
}

const assertOrderInserted = (o, dataset, matchVirtual) => {
  debug('assert order inserted into OB (%f @ %f)', o.amountOrig, o.price)
  
  return assertOrderChanged(o, dataset, 1, matchVirtual)
}

const assertOrderRemoved = (o, dataset, matchVirtual) => {
  debug('assert order removed from OB (%f @ %f)', o.amountOrig, o.price)

  return assertOrderChanged(o, dataset, -1, matchVirtual)
}

// TODO: refactor
const assertOrderNotInserted = (o, dataset, matchVirtual) => {
  try {
    debug('assert order not inserted into OB (%f @ %f)', o.amountOrig, o.price)

    assertOrderChanged(o, dataset, 1, matchVirtual)
    throw new Error('nope') // the assert did not fail
  } catch (e) {
    if (e.message === 'nope') {
      throw new Error('order inserted into OB')
    }
  }
}

const assertOrderNotRemoved = (o, dataset, matchVirtual) => {
  try {
    debug('assert order not removed from OB (%f @ %f)', o.amountOrig, o.price)

    assertOrderChanged(o, dataset, -1, matchVirtual)
    throw new Error('nope') //
  } catch (e) {
    if (e.message === 'nope') {
      throw new Error('order removed from OB')
    }
  }
}

module.exports = {
  assertOrderChanged, assertOrderInserted, assertOrderRemoved,
  assertOrderNotRemoved, assertOrderNotInserted
}
