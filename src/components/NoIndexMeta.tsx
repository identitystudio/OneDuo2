import { Helmet } from 'react-helmet-async';

export const NoIndexMeta = () => (
  <Helmet>
    <meta name="robots" content="noindex, nofollow" />
  </Helmet>
);
