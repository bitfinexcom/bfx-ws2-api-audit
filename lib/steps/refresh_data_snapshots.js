'use strict'

// TODO: te/tu sync pending
module.exports = (targets = ['maker', 'taker']) => ({
  id: 'refresh_data_snapshots',
  label: 'refreshes local wallet/order book/trade snapshots',
  actors: targets,
  exec: ({ refreshSnapshots }) => {
    return refreshSnapshots(targets)
  }
})
