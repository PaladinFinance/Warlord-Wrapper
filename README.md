# Warlord Wrapper

deploy address : 0x8fEf29604D16987E2a0C8AE1DFbA47495fF4888a

## Overview

This is a wrapper for the stkWAR token from Warlord.  
stkWAR is the staked version of WAR, accruing rewards from the Warlord system. To be used to LP in DEX pools,
the stkWAR needs to be wrapped so the rewards are not lost when LPing.  
This wrapper, wstkWAR, claimed from the stkWAR, and adds a logic of "allowed claimers" so contracts not designed to claim
the rewards can have a third party address claiming for them.  
The wrapper only claims and accrues from stkWAR the list of token given, which can or cannot be the whole list of rewards from stkWAR.  