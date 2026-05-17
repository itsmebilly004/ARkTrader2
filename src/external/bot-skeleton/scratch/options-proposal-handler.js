// Visual-only port: original module handled live WS proposal subscription
// for vanilla/multiplier/turbo options. No-ops keep the import graph clean.

import { CONTRACT_TYPES } from "@/components/shared";

export const DEFAULT_OPTIONS_PROPOSAL_REQUEST = {
  amount: undefined,
  basis: "stake",
  contract_type: undefined,
  currency: undefined,
  symbol: undefined,
  duration: undefined,
  duration_unit: undefined,
  proposal: 1,
};

export const requestOptionsProposalForQS = (_input_values, _ws) => null;

export const buildOptionsProposalRequests = (_block) => [];

export const handleOptionsProposal = async (_block) => null;

export const forgetOptionsProposal = async (_instance) => {
  // No-op
};

export { CONTRACT_TYPES };

export default {
  DEFAULT_OPTIONS_PROPOSAL_REQUEST,
  requestOptionsProposalForQS,
  buildOptionsProposalRequests,
  handleOptionsProposal,
  forgetOptionsProposal,
};
