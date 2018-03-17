'use strict'

const debug = require('debug')('bfx-ws2-api-audit:assert:orderbook')

/**
 * See assertOrderInserted & assertOrderRemoved. Does not log
 *
 * @param {Order} o 
 * @param {Dataset} dataset 
 * @param {number} direction - 1 for removed, -1 for inserted
 */
const assertOrderChanged = (o, dataset, direction) => {
  if (direction !== -1 && direction !== 1) {
    throw new Error(`unkown direction: ${direction}`)
  }

  const { price } = o
  const amount = o.amountOrig
  const ob = dataset.getOrderBook()
  const obSnap = dataset.getOrderBookSnapshot()
  const obSide = amount > 0 ? ob.bids : ob.asks
  const obSnapSide = amount > 0 ? obSnap.bids : obSnap.asks

  let priceInNewOB = false
  let priceInOldOB = false
  let newLevel = null
  let oldLevel = null

  for (let i = 0; i < obSide.length; i += 1) {
    if (obSide[i][0] !== price) continue

    priceInNewOB = true
    newLevel = obSide[i]
    break
  }

  if (!priceInNewOB && direction === 1) {
    throw new Error(`order price level not in new order book: ${price}`)
  }

  for (let i = 0; i < obSnapSide.length; i += 1) {
    if (obSnapSide[i][0] !== price) continue

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
    const amountDelta = newLevel[2] - oldLevel[2]

    if (amountDelta < (amount * direction)) {
      throw new Error('ob level amount did not increase/decrease for order')
    }
  }
}

const assertOrderInserted = (o, dataset) => {
  debug('assert order inserted into OB (%f @ %f)', o.amountOrig, o.price)
  
  return assertOrderChanged(o, dataset, 1)
}

const assertOrderRemoved = (o, dataset) => {
  debug('assert order removed from OB (%f @ %f)', o.amountOrig, o.price)

  return assertOrderChanged(o, dataset, -1)
}

// TODO: refactor
const assertOrderNotInserted = (o, dataset) => {
  try {
    assertOrderInserted(o, dataset)
    throw new Error('nope') // the assert did not fail
  } catch (e) {
    if (e.message === 'nope') {
      throw new Error('order inserted into OB')
    }
  }
}

const assertOrderNotRemoved = (o, dataset) => {
  try {
    assertOrderRemoved(o, dataset)
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
