import { useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export function useUTMTracking() {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  useEffect(() => {
    const trackVisit = async () => {
      // Get UTM parameters
      const utmSource = searchParams.get('utm_source');
      const utmMedium = searchParams.get('utm_medium');
      const utmCampaign = searchParams.get('utm_campaign');
      const utmContent = searchParams.get('utm_content');
      const utmTerm = searchParams.get('utm_term');

      // Build source string from UTM params
      const sourceParts = [
        utmSource && `src:${utmSource}`,
        utmMedium && `med:${utmMedium}`,
        utmCampaign && `cmp:${utmCampaign}`,
        utmContent && `cnt:${utmContent}`,
        utmTerm && `trm:${utmTerm}`,
      ].filter(Boolean);

      const source = sourceParts.length > 0 ? sourceParts.join('|') : 'direct';

      // Get or create visitor ID
      let visitorId = localStorage.getItem('oneduo_visitor_id');
      if (!visitorId) {
        visitorId = crypto.randomUUID();
        localStorage.setItem('oneduo_visitor_id', visitorId);
      }

      // Determine page name based on pathname
      let pageName = 'home';
      if (location.pathname === '/ecom') pageName = 'ecom';
      else if (location.pathname === '/film') pageName = 'film';

      try {
        await supabase.from('page_visits').insert({
          page: pageName,
          source,
          visitor_id: visitorId,
        });
      } catch (err) {
        console.error('Failed to track visit:', err);
      }
    };

    trackVisit();
  }, [location.pathname]); // Only track once per page
}
