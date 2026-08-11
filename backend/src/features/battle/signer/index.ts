export { createKmsSigner, createKmsSignerFromPort, type KmsKeyPort } from './signer.kms';
export { createLocalSigner } from './signer.local';
export {
    activeSigningKey,
    configureSigner,
    listSigningKeys,
    loadPersistedSigningKeys,
    registerRotatedKey,
    resetSigner,
    sign,
    signerAuditLog,
} from './signer.service';
export { loadSigningKeys, persistSigningKey, retireInactiveKeys } from './signer.registry';
export {
    type EngineAttestation,
    type SignableKind,
    type SignerAuditEntry,
    type SignerBackend,
    SignerRefusedError,
    type SigningKeyDescriptor,
    type SignRefusal,
    type SignRequest,
    type SignResult,
} from './signer.types';
