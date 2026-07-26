export {
    compareShadowRun,
    type ComparisonResult,
    type FightOutcome,
    type ObservedOutcome,
    type PredictedOutcome,
    type ShadowStatus,
} from './compare';
export {
    recordShadowOutcome,
    resetShadowCounters,
    shadowCounters,
    shadowSummary,
    type ShadowCounters,
    type ShadowSummary,
} from './metrics';
export {
    observeOnSettle,
    predictOnReveal,
    type ObserveRequest,
    type PredictRequest,
    type ShadowInputs,
} from './shadow.service';
