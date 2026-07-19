import { Counter } from "k6/metrics";

export const authRequestCount = new Counter("htbf_auth_requests");
export const auth429Count = new Counter("htbf_auth_429");
export const loadPhaseAuthRequestCount = new Counter("htbf_load_phase_auth_requests");
