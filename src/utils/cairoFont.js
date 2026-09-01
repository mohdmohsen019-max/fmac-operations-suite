import CairoRegularDataUri from '../assets/fonts/Cairo-Regular-Pdf.ttf?inline';
import CairoBoldDataUri from '../assets/fonts/Cairo-Bold-Pdf.ttf?inline';

const stripDataUriPrefix = (value) => String(value || '').replace(/^data:[^,]+,/, '');

// Static 400/700 instances generated from Google Fonts' official Cairo
// variable font. They are embedded into every PDF so Arabic typography and
// shaping remain intact when the document is opened on another computer.
export const CairoRegularBase64 = stripDataUriPrefix(CairoRegularDataUri);
export const CairoBoldBase64 = stripDataUriPrefix(CairoBoldDataUri);
