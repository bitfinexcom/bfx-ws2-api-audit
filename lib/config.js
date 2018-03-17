'use strict'

const M_FEE = 0.001
const T_FEE = 0.002

module.exports = {
  M_FEE,
  T_FEE,
  M_FEE_M: 1 - M_FEE,
  T_FEE_M: 1 - T_FEE,
  DUST: { // TODO: revise, min deltas for balance equality
    IOT: 0.01,
    ETH: 0.0001,
    USD: 0.000001
  }
}
