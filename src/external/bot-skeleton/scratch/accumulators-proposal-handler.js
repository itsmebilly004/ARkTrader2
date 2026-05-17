// Visual-only port: the original module ran the WS proposal subscription for
// accumulator contracts. arktrader's runtime owns proposals, so these are
// no-op stubs that match the original export signature.

export const DEFAULT_PROPOSAL_REQUEST = {
  amount: undefined,
  basis: "stake",
  contract_type: "ACCU",
  currency: undefined,
  symbol: undefined,
  growth_rate: undefined,
  proposal: 1,
  subscribe: 1,
};

export const forgetAccumulatorsProposalRequest = async (_instance) => {
  // No-op
};

export const handleProposalRequestForAccumulators = async (_block, _instance) => {
  // No-op
};

export default {
  DEFAULT_PROPOSAL_REQUEST,
  forgetAccumulatorsProposalRequest,
  handleProposalRequestForAccumulators,
};
