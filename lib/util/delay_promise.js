'use strict'

const Promise = require('bluebird')

/**
 * Delays the resolution of the provided promise; useful when waiting for ws2
 * data to arrive as a result of the promise executing
 *
 * @param {Promise} p 
 * @param {number?} delay - optional, defaults to 5s
 * @return {Promise} delayedP
 */
module.exports = (p, delay = 5000) => {
  return new Promise((resolve, reject) => {
    p.then(() => {
      setTimeout(resolve, delay)
    }).catch(reject)
  })
}

