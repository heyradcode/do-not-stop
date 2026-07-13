import React from 'react';
import PetGallery from '@components/pet/collection/pet-gallery';

/** Top-level `/main` page — the idle gallery (stat strip + pet collection).
 *  Feature navigation lives in the shell sidebar. */
const HomePage: React.FC = () => <PetGallery />;

export default HomePage;
