import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import Layout from '@components/layout';
import PetGallery from '@components/pet/collection/pet-gallery';
import { isInteractionRoute } from '@constants/interactionRoutes';
import './index.css';

/** App shell shared by every page: layout chrome, the routed page (`<Outlet/>`),
 * and the pet collection (hidden on full-page interaction routes). */
const MainLayout: React.FC = () => {
  const location = useLocation();
  /** Full-page interaction routes hide the pet collection. */
  const isGalleryHidden = isInteractionRoute(location.pathname);

  return (
    <Layout contentClassName="authenticated">
      <Outlet />
      {!isGalleryHidden && <PetGallery />}
    </Layout>
  );
};

export default MainLayout;
