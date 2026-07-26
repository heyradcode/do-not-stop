export { createKmsSigner } from './signer.kms';
export { createLocalSigner } from './signer.local';
export {
    activeSigningKey,
    configureSigner,
    listSigningKeys,
    registerRotatedKey,
    resetSigner,
    sign,
    signerAuditLog,
} from './signer.service';
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
