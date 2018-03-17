'use strict'

module.exports = () => ({
  id: 'teardown_datset',
  label: 'removes dataset listeners & unsubscribes from channels',
  actors: ['maker', 'taker'],
  exec: ({ dataT, dataM }) => {
    dataT.unregisterListeners()
    dataT.unsubscribeChannels()
    dataM.unregisterListeners()
    dataM.unsubscribeChannels()

    return Promise.resolve()
  }
})
