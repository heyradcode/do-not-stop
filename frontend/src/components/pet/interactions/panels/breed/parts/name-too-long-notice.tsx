import React from 'react';
import { PET_NAME_MAX_BYTES, isPetNameWithinChainLimit, petNameByteLength } from '@shared/core';
import styles from '../index.module.css';

/**
 * Why the breed button is disabled when the name looks short enough.
 *
 * Both chains cap a pet name at 32 UTF-8 bytes, while the input's `maxLength` counts UTF-16
 * code units. Twenty CJK characters are 60 bytes and ten emoji are 40, so a name that fits
 * the form is rejected on chain. `useBreedPanel` blocks the submit; without this the player
 * would only see a button that has stopped working.
 */
const NameTooLongNotice: React.FC<{ name: string }> = ({ name }) => {
    const trimmed = name.trim();
    if (!trimmed || isPetNameWithinChainLimit(trimmed)) return null;

    return (
        <p className={styles.relativeWarning}>
            That name is {petNameByteLength(trimmed)} bytes and the limit is{' '}
            {PET_NAME_MAX_BYTES}. Accented, CJK and emoji characters each take more than one.
        </p>
    );
};

export default NameTooLongNotice;
