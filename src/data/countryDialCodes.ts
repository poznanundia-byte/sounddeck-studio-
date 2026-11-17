export interface CountryDialCode {
  iso: string;
  name: string;
  dialCode: string;
  flag: string;
  example?: string;
  minDigits?: number;
  maxDigits?: number;
}

/**
 * Comprehensive ITU/ISO global calling codes covering every country & territory worldwide.
 * Includes Kenya (+254, supporting +254142590695, 07xx, 01xx) and all global codes.
 */
export const GLOBAL_COUNTRY_DIAL_CODES: CountryDialCode[] = [
  { iso: 'KE', name: 'Kenya', dialCode: '+254', flag: '🇰🇪', example: '142590695', minDigits: 9, maxDigits: 9 },
  { iso: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', example: '4155550199', minDigits: 10, maxDigits: 10 },
  { iso: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧', example: '7700900123', minDigits: 10, maxDigits: 10 },
  { iso: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬', example: '8031234567', minDigits: 10, maxDigits: 10 },
  { iso: 'TZ', name: 'Tanzania', dialCode: '+255', flag: '🇹🇿', example: '712345678', minDigits: 9, maxDigits: 9 },
  { iso: 'UG', name: 'Uganda', dialCode: '+256', flag: '🇺🇬', example: '772123456', minDigits: 9, maxDigits: 9 },
  { iso: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦', example: '821234567', minDigits: 9, maxDigits: 9 },
  { iso: 'GH', name: 'Ghana', dialCode: '+233', flag: '🇬🇭', example: '241234567', minDigits: 9, maxDigits: 9 },
  { iso: 'RW', name: 'Rwanda', dialCode: '+250', flag: '🇷🇼', example: '781234567', minDigits: 9, maxDigits: 9 },
  { iso: 'ET', name: 'Ethiopia', dialCode: '+251', flag: '🇪🇹', example: '911234567', minDigits: 9, maxDigits: 9 },
  { iso: 'AF', name: 'Afghanistan', dialCode: '+93', flag: '🇦🇫', example: '701234567' },
  { iso: 'AL', name: 'Albania', dialCode: '+355', flag: '🇦🇱', example: '672123456' },
  { iso: 'DZ', name: 'Algeria', dialCode: '+213', flag: '🇩🇿', example: '551234567' },
  { iso: 'AS', name: 'American Samoa', dialCode: '+1684', flag: '🇦🇸' },
  { iso: 'AD', name: 'Andorra', dialCode: '+376', flag: '🇦🇩' },
  { iso: 'AO', name: 'Angola', dialCode: '+244', flag: '🇦🇴' },
  { iso: 'AI', name: 'Anguilla', dialCode: '+1264', flag: '🇦🇮' },
  { iso: 'AG', name: 'Antigua & Barbuda', dialCode: '+1268', flag: '🇦🇬' },
  { iso: 'AR', name: 'Argentina', dialCode: '+54', flag: '🇦🇷' },
  { iso: 'AM', name: 'Armenia', dialCode: '+374', flag: '🇦🇲' },
  { iso: 'AW', name: 'Aruba', dialCode: '+297', flag: '🇦🇼' },
  { iso: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺', example: '412345678' },
  { iso: 'AT', name: 'Austria', dialCode: '+43', flag: '🇦🇹' },
  { iso: 'AZ', name: 'Azerbaijan', dialCode: '+994', flag: '🇦🇿' },
  { iso: 'BS', name: 'Bahamas', dialCode: '+1242', flag: '🇧🇸' },
  { iso: 'BH', name: 'Bahrain', dialCode: '+973', flag: '🇧🇭' },
  { iso: 'BD', name: 'Bangladesh', dialCode: '+880', flag: '🇧🇩' },
  { iso: 'BB', name: 'Barbados', dialCode: '+1246', flag: '🇧🇧' },
  { iso: 'BY', name: 'Belarus', dialCode: '+375', flag: '🇧🇾' },
  { iso: 'BE', name: 'Belgium', dialCode: '+32', flag: '🇧🇪' },
  { iso: 'BZ', name: 'Belize', dialCode: '+501', flag: '🇧🇿' },
  { iso: 'BJ', name: 'Benin', dialCode: '+229', flag: '🇧🇯' },
  { iso: 'BM', name: 'Bermuda', dialCode: '+1441', flag: '🇧🇲' },
  { iso: 'BT', name: 'Bhutan', dialCode: '+975', flag: '🇧🇹' },
  { iso: 'BO', name: 'Bolivia', dialCode: '+591', flag: '🇧🇴' },
  { iso: 'BA', name: 'Bosnia & Herzegovina', dialCode: '+387', flag: '🇧🇦' },
  { iso: 'BW', name: 'Botswana', dialCode: '+267', flag: '🇧🇼' },
  { iso: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷', example: '11987654321' },
  { iso: 'IO', name: 'British Indian Ocean Territory', dialCode: '+246', flag: '🇮🇴' },
  { iso: 'VG', name: 'British Virgin Islands', dialCode: '+1284', flag: '🇻🇬' },
  { iso: 'BN', name: 'Brunei', dialCode: '+673', flag: '🇧🇳' },
  { iso: 'BG', name: 'Bulgaria', dialCode: '+359', flag: '🇧🇬' },
  { iso: 'BF', name: 'Burkina Faso', dialCode: '+226', flag: '🇧🇫' },
  { iso: 'BI', name: 'Burundi', dialCode: '+257', flag: '🇧🇮' },
  { iso: 'KH', name: 'Cambodia', dialCode: '+855', flag: '🇰🇭' },
  { iso: 'CM', name: 'Cameroon', dialCode: '+237', flag: '🇨🇲' },
  { iso: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦', example: '4165550199', minDigits: 10, maxDigits: 10 },
  { iso: 'CV', name: 'Cape Verde', dialCode: '+238', flag: '🇨🇻' },
  { iso: 'KY', name: 'Cayman Islands', dialCode: '+1345', flag: '🇰🇾' },
  { iso: 'CF', name: 'Central African Republic', dialCode: '+236', flag: '🇨🇫' },
  { iso: 'TD', name: 'Chad', dialCode: '+235', flag: '🇹🇩' },
  { iso: 'CL', name: 'Chile', dialCode: '+56', flag: '🇨🇱' },
  { iso: 'CN', name: 'China', dialCode: '+86', flag: '🇨🇳' },
  { iso: 'CO', name: 'Colombia', dialCode: '+57', flag: '🇨🇴' },
  { iso: 'KM', name: 'Comoros', dialCode: '+269', flag: '🇰🇲' },
  { iso: 'CG', name: 'Congo (Republic)', dialCode: '+242', flag: '🇨🇬' },
  { iso: 'CD', name: 'Congo (DRC)', dialCode: '+243', flag: '🇨🇩' },
  { iso: 'CK', name: 'Cook Islands', dialCode: '+682', flag: '🇨🇰' },
  { iso: 'CR', name: 'Costa Rica', dialCode: '+506', flag: '🇨🇷' },
  { iso: 'CI', name: "Cote d'Ivoire", dialCode: '+225', flag: '🇨🇮' },
  { iso: 'HR', name: 'Croatia', dialCode: '+385', flag: '🇭🇷' },
  { iso: 'CU', name: 'Cuba', dialCode: '+53', flag: '🇨🇺' },
  { iso: 'CW', name: 'Curacao', dialCode: '+599', flag: '🇨🇼' },
  { iso: 'CY', name: 'Cyprus', dialCode: '+357', flag: '🇨🇾' },
  { iso: 'CZ', name: 'Czechia', dialCode: '+420', flag: '🇨🇿' },
  { iso: 'DK', name: 'Denmark', dialCode: '+45', flag: '🇩🇰' },
  { iso: 'DJ', name: 'Djibouti', dialCode: '+253', flag: '🇩🇯' },
  { iso: 'DM', name: 'Dominica', dialCode: '+1767', flag: '🇩🇲' },
  { iso: 'DO', name: 'Dominican Republic', dialCode: '+1809', flag: '🇩🇴' },
  { iso: 'EC', name: 'Ecuador', dialCode: '+593', flag: '🇪🇨' },
  { iso: 'EG', name: 'Egypt', dialCode: '+20', flag: '🇪🇬' },
  { iso: 'SV', name: 'El Salvador', dialCode: '+503', flag: '🇸🇻' },
  { iso: 'GQ', name: 'Equatorial Guinea', dialCode: '+240', flag: '🇬🇶' },
  { iso: 'ER', name: 'Eritrea', dialCode: '+291', flag: '🇪🇷' },
  { iso: 'EE', name: 'Estonia', dialCode: '+372', flag: '🇪🇪' },
  { iso: 'SZ', name: 'Eswatini', dialCode: '+268', flag: '🇸🇿' },
  { iso: 'FK', name: 'Falkland Islands', dialCode: '+500', flag: '🇫🇰' },
  { iso: 'FO', name: 'Faroe Islands', dialCode: '+298', flag: '🇫🇴' },
  { iso: 'FJ', name: 'Fiji', dialCode: '+679', flag: '🇫🇯' },
  { iso: 'FI', name: 'Finland', dialCode: '+358', flag: '🇫🇮' },
  { iso: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷', example: '612345678' },
  { iso: 'GF', name: 'French Guiana', dialCode: '+594', flag: '🇬🇫' },
  { iso: 'PF', name: 'French Polynesia', dialCode: '+689', flag: '🇵🇫' },
  { iso: 'GA', name: 'Gabon', dialCode: '+241', flag: '🇬🇦' },
  { iso: 'GM', name: 'Gambia', dialCode: '+220', flag: '🇬🇲' },
  { iso: 'GE', name: 'Georgia', dialCode: '+995', flag: '🇬🇪' },
  { iso: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪', example: '15123456789' },
  { iso: 'GI', name: 'Gibraltar', dialCode: '+350', flag: '🇬🇮' },
  { iso: 'GR', name: 'Greece', dialCode: '+30', flag: '🇬🇷' },
  { iso: 'GL', name: 'Greenland', dialCode: '+299', flag: '🇬🇱' },
  { iso: 'GD', name: 'Grenada', dialCode: '+1473', flag: '🇬🇩' },
  { iso: 'GP', name: 'Guadeloupe', dialCode: '+590', flag: '🇬🇵' },
  { iso: 'GU', name: 'Guam', dialCode: '+1671', flag: '🇬🇺' },
  { iso: 'GT', name: 'Guatemala', dialCode: '+502', flag: '🇬🇹' },
  { iso: 'GN', name: 'Guinea', dialCode: '+224', flag: '🇬🇳' },
  { iso: 'GW', name: 'Guinea-Bissau', dialCode: '+245', flag: '🇬🇼' },
  { iso: 'GY', name: 'Guyana', dialCode: '+592', flag: '🇬🇾' },
  { iso: 'HT', name: 'Haiti', dialCode: '+509', flag: '🇭🇹' },
  { iso: 'HN', name: 'Honduras', dialCode: '+504', flag: '🇭🇳' },
  { iso: 'HK', name: 'Hong Kong', dialCode: '+852', flag: '🇭🇰' },
  { iso: 'HU', name: 'Hungary', dialCode: '+36', flag: '🇭🇺' },
  { iso: 'IS', name: 'Iceland', dialCode: '+354', flag: '🇮🇸' },
  { iso: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳', example: '9876543210', minDigits: 10, maxDigits: 10 },
  { iso: 'ID', name: 'Indonesia', dialCode: '+62', flag: '🇮🇩' },
  { iso: 'IR', name: 'Iran', dialCode: '+98', flag: '🇮🇷' },
  { iso: 'IQ', name: 'Iraq', dialCode: '+964', flag: '🇮🇶' },
  { iso: 'IE', name: 'Ireland', dialCode: '+353', flag: '🇮🇪' },
  { iso: 'IL', name: 'Israel', dialCode: '+972', flag: '🇮🇱' },
  { iso: 'IT', name: 'Italy', dialCode: '+39', flag: '🇮🇹' },
  { iso: 'JM', name: 'Jamaica', dialCode: '+1876', flag: '🇯🇲' },
  { iso: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵' },
  { iso: 'JO', name: 'Jordan', dialCode: '+962', flag: '🇯🇴' },
  { iso: 'KZ', name: 'Kazakhstan', dialCode: '+7', flag: '🇰🇿' },
  { iso: 'KI', name: 'Kiribati', dialCode: '+686', flag: '🇰🇮' },
  { iso: 'KP', name: 'North Korea', dialCode: '+850', flag: '🇰🇵' },
  { iso: 'KR', name: 'South Korea', dialCode: '+82', flag: '🇰🇷' },
  { iso: 'XK', name: 'Kosovo', dialCode: '+383', flag: '🇽🇰' },
  { iso: 'KW', name: 'Kuwait', dialCode: '+965', flag: '🇰🇼' },
  { iso: 'KG', name: 'Kyrgyzstan', dialCode: '+996', flag: '🇰🇬' },
  { iso: 'LA', name: 'Laos', dialCode: '+856', flag: '🇱🇦' },
  { iso: 'LV', name: 'Latvia', dialCode: '+371', flag: '🇱🇻' },
  { iso: 'LB', name: 'Lebanon', dialCode: '+961', flag: '🇱🇧' },
  { iso: 'LS', name: 'Lesotho', dialCode: '+266', flag: '🇱🇸' },
  { iso: 'LR', name: 'Liberia', dialCode: '+231', flag: '🇱🇷' },
  { iso: 'LY', name: 'Libya', dialCode: '+218', flag: '🇱🇾' },
  { iso: 'LI', name: 'Liechtenstein', dialCode: '+423', flag: '🇱🇮' },
  { iso: 'LT', name: 'Lithuania', dialCode: '+370', flag: '🇱🇹' },
  { iso: 'LU', name: 'Luxembourg', dialCode: '+352', flag: '🇱🇺' },
  { iso: 'MO', name: 'Macau', dialCode: '+853', flag: '🇲🇴' },
  { iso: 'MG', name: 'Madagascar', dialCode: '+261', flag: '🇲🇬' },
  { iso: 'MW', name: 'Malawi', dialCode: '+265', flag: '🇲🇼' },
  { iso: 'MY', name: 'Malaysia', dialCode: '+60', flag: '🇲🇾' },
  { iso: 'MV', name: 'Maldives', dialCode: '+960', flag: '🇲🇻' },
  { iso: 'ML', name: 'Mali', dialCode: '+223', flag: '🇲🇱' },
  { iso: 'MT', name: 'Malta', dialCode: '+356', flag: '🇲🇹' },
  { iso: 'MH', name: 'Marshall Islands', dialCode: '+692', flag: '🇲🇭' },
  { iso: 'MQ', name: 'Martinique', dialCode: '+596', flag: '🇲🇶' },
  { iso: 'MR', name: 'Mauritania', dialCode: '+222', flag: '🇲🇷' },
  { iso: 'MU', name: 'Mauritius', dialCode: '+230', flag: '🇲🇺' },
  { iso: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽' },
  { iso: 'FM', name: 'Micronesia', dialCode: '+691', flag: '🇫🇲' },
  { iso: 'MD', name: 'Moldova', dialCode: '+373', flag: '🇲🇩' },
  { iso: 'MC', name: 'Monaco', dialCode: '+377', flag: '🇲🇨' },
  { iso: 'MN', name: 'Mongolia', dialCode: '+976', flag: '🇲🇳' },
  { iso: 'ME', name: 'Montenegro', dialCode: '+382', flag: '🇲🇪' },
  { iso: 'MS', name: 'Montserrat', dialCode: '+1664', flag: '🇲🇸' },
  { iso: 'MA', name: 'Morocco', dialCode: '+212', flag: '🇲🇦' },
  { iso: 'MZ', name: 'Mozambique', dialCode: '+258', flag: '🇲🇿' },
  { iso: 'MM', name: 'Myanmar', dialCode: '+95', flag: '🇲🇲' },
  { iso: 'NA', name: 'Namibia', dialCode: '+264', flag: '🇳🇦' },
  { iso: 'NR', name: 'Nauru', dialCode: '+674', flag: '🇳🇷' },
  { iso: 'NP', name: 'Nepal', dialCode: '+977', flag: '🇳🇵' },
  { iso: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱' },
  { iso: 'NC', name: 'New Caledonia', dialCode: '+687', flag: '🇳🇨' },
  { iso: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿' },
  { iso: 'NI', name: 'Nicaragua', dialCode: '+505', flag: '🇳🇮' },
  { iso: 'NE', name: 'Niger', dialCode: '+227', flag: '🇳🇪' },
  { iso: 'NU', name: 'Niue', dialCode: '+683', flag: '🇳🇺' },
  { iso: 'MK', name: 'North Macedonia', dialCode: '+389', flag: '🇲🇰' },
  { iso: 'MP', name: 'Northern Mariana Islands', dialCode: '+1670', flag: '🇲🇵' },
  { iso: 'NO', name: 'Norway', dialCode: '+47', flag: '🇳🇴' },
  { iso: 'OM', name: 'Oman', dialCode: '+968', flag: '🇴🇲' },
  { iso: 'PK', name: 'Pakistan', dialCode: '+92', flag: '🇵🇰' },
  { iso: 'PW', name: 'Palau', dialCode: '+680', flag: '🇵🇼' },
  { iso: 'PS', name: 'Palestine', dialCode: '+970', flag: '🇵🇸' },
  { iso: 'PA', name: 'Panama', dialCode: '+507', flag: '🇵🇦' },
  { iso: 'PG', name: 'Papua New Guinea', dialCode: '+675', flag: '🇵🇬' },
  { iso: 'PY', name: 'Paraguay', dialCode: '+595', flag: '🇵🇾' },
  { iso: 'PE', name: 'Peru', dialCode: '+51', flag: '🇵🇪' },
  { iso: 'PH', name: 'Philippines', dialCode: '+63', flag: '🇵🇭' },
  { iso: 'PL', name: 'Poland', dialCode: '+48', flag: '🇵🇱' },
  { iso: 'PT', name: 'Portugal', dialCode: '+351', flag: '🇵🇹' },
  { iso: 'PR', name: 'Puerto Rico', dialCode: '+1787', flag: '🇵🇷' },
  { iso: 'QA', name: 'Qatar', dialCode: '+974', flag: '🇶🇦' },
  { iso: 'RE', name: 'Reunion', dialCode: '+262', flag: '🇷🇪' },
  { iso: 'RO', name: 'Romania', dialCode: '+40', flag: '🇷🇴' },
  { iso: 'RU', name: 'Russia', dialCode: '+7', flag: '🇷🇺' },
  { iso: 'KN', name: 'Saint Kitts & Nevis', dialCode: '+1869', flag: '🇰🇳' },
  { iso: 'LC', name: 'Saint Lucia', dialCode: '+1758', flag: '🇱🇨' },
  { iso: 'PM', name: 'Saint Pierre & Miquelon', dialCode: '+508', flag: '🇵🇲' },
  { iso: 'VC', name: 'Saint Vincent & Grenadines', dialCode: '+1784', flag: '🇻🇨' },
  { iso: 'WS', name: 'Samoa', dialCode: '+685', flag: '🇼🇸' },
  { iso: 'SM', name: 'San Marino', dialCode: '+378', flag: '🇸🇲' },
  { iso: 'ST', name: 'Sao Tome & Principe', dialCode: '+239', flag: '🇸🇹' },
  { iso: 'SA', name: 'Saudi Arabia', dialCode: '+966', flag: '🇸🇦' },
  { iso: 'SN', name: 'Senegal', dialCode: '+221', flag: '🇸🇳' },
  { iso: 'RS', name: 'Serbia', dialCode: '+381', flag: '🇷🇸' },
  { iso: 'SC', name: 'Seychelles', dialCode: '+248', flag: '🇸🇨' },
  { iso: 'SL', name: 'Sierra Leone', dialCode: '+232', flag: '🇸🇱' },
  { iso: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬' },
  { iso: 'SX', name: 'Sint Maarten', dialCode: '+1721', flag: '🇸🇽' },
  { iso: 'SK', name: 'Slovakia', dialCode: '+421', flag: '🇸🇰' },
  { iso: 'SI', name: 'Slovenia', dialCode: '+386', flag: '🇸🇮' },
  { iso: 'SB', name: 'Solomon Islands', dialCode: '+677', flag: '🇸🇧' },
  { iso: 'SO', name: 'Somalia', dialCode: '+252', flag: '🇸🇴' },
  { iso: 'SS', name: 'South Sudan', dialCode: '+211', flag: '🇸🇸' },
  { iso: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸' },
  { iso: 'LK', name: 'Sri Lanka', dialCode: '+94', flag: '🇱🇰' },
  { iso: 'SD', name: 'Sudan', dialCode: '+249', flag: '🇸🇩' },
  { iso: 'SR', name: 'Suriname', dialCode: '+597', flag: '🇸🇷' },
  { iso: 'SE', name: 'Sweden', dialCode: '+46', flag: '🇸🇪' },
  { iso: 'CH', name: 'Switzerland', dialCode: '+41', flag: '🇨🇭' },
  { iso: 'SY', name: 'Syria', dialCode: '+963', flag: '🇸🇾' },
  { iso: 'TW', name: 'Taiwan', dialCode: '+886', flag: '🇹🇼' },
  { iso: 'TJ', name: 'Tajikistan', dialCode: '+992', flag: '🇹🇯' },
  { iso: 'TH', name: 'Thailand', dialCode: '+66', flag: '🇹🇭' },
  { iso: 'TL', name: 'Timor-Leste', dialCode: '+670', flag: '🇹🇱' },
  { iso: 'TG', name: 'Togo', dialCode: '+228', flag: '🇹🇬' },
  { iso: 'TO', name: 'Tonga', dialCode: '+676', flag: '🇹🇴' },
  { iso: 'TT', name: 'Trinidad & Tobago', dialCode: '+1868', flag: '🇹🇹' },
  { iso: 'TN', name: 'Tunisia', dialCode: '+216', flag: '🇹🇳' },
  { iso: 'TR', name: 'Turkey', dialCode: '+90', flag: '🇹🇷' },
  { iso: 'TM', name: 'Turkmenistan', dialCode: '+993', flag: '🇹🇲' },
  { iso: 'TC', name: 'Turks & Caicos Islands', dialCode: '+1649', flag: '🇹🇨' },
  { iso: 'TV', name: 'Tuvalu', dialCode: '+688', flag: '🇹🇻' },
  { iso: 'UA', name: 'Ukraine', dialCode: '+380', flag: '🇺🇦' },
  { iso: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪', example: '501234567' },
  { iso: 'UY', name: 'Uruguay', dialCode: '+598', flag: '🇺🇾' },
  { iso: 'VI', name: 'US Virgin Islands', dialCode: '+1340', flag: '🇻🇮' },
  { iso: 'UZ', name: 'Uzbekistan', dialCode: '+998', flag: '🇺🇿' },
  { iso: 'VU', name: 'Vanuatu', dialCode: '+678', flag: '🇻🇺' },
  { iso: 'VA', name: 'Vatican City', dialCode: '+379', flag: '🇻🇦' },
  { iso: 'VE', name: 'Venezuela', dialCode: '+58', flag: '🇻🇪' },
  { iso: 'VN', name: 'Vietnam', dialCode: '+84', flag: '🇻🇳' },
  { iso: 'WF', name: 'Wallis & Futuna', dialCode: '+681', flag: '🇼🇫' },
  { iso: 'YE', name: 'Yemen', dialCode: '+967', flag: '🇾🇪' },
  { iso: 'ZM', name: 'Zambia', dialCode: '+260', flag: '🇿🇲' },
  { iso: 'ZW', name: 'Zimbabwe', dialCode: '+263', flag: '🇿🇼' },
];

// Longest-dial-code-first index for unambiguous prefix matching (+1876 before +1, +254 before +25)
const SORTED_BY_DIAL_LENGTH = [...GLOBAL_COUNTRY_DIAL_CODES].sort(
  (a, b) => b.dialCode.length - a.dialCode.length
);

export function findCountryByIso(iso?: string): CountryDialCode {
  const upper = (iso || '').toUpperCase();
  return GLOBAL_COUNTRY_DIAL_CODES.find((c) => c.iso === upper) || GLOBAL_COUNTRY_DIAL_CODES[0];
}

export function findCountryByDialCode(dialCode?: string): CountryDialCode {
  if (!dialCode) return GLOBAL_COUNTRY_DIAL_CODES[0];
  const clean = dialCode.startsWith('+') ? dialCode : `+${dialCode}`;
  return GLOBAL_COUNTRY_DIAL_CODES.find((c) => c.dialCode === clean) || GLOBAL_COUNTRY_DIAL_CODES[0];
}

export interface ParsedGlobalPhone {
  country: CountryDialCode;
  nationalNumber: string;
  e164: string;
  isValid: boolean;
  error?: string;
}

/**
 * Normalizes any global phone input (full E.164 like "+254142590695",
 * spaced "+254 142 590 695", local with leading zero "0142590695",
 * or bare national "142590695") against the selected global country code.
 */
export function normalizeGlobalPhone(
  rawInput: string,
  selectedCountry: CountryDialCode = GLOBAL_COUNTRY_DIAL_CODES[0]
): ParsedGlobalPhone {
  const trimmed = rawInput.trim();
  const hasPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');

  let country = selectedCountry;
  let national = digitsOnly;

  if (hasPlus && digitsOnly.length > 0) {
    const withPlus = `+${digitsOnly}`;
    const matched = SORTED_BY_DIAL_LENGTH.find((c) => withPlus.startsWith(c.dialCode));
    if (matched) {
      country = matched;
      national = digitsOnly.slice(matched.dialCode.length - 1);
    }
  } else if (trimmed.startsWith('00') && digitsOnly.length > 4) {
    const withPlus = `+${digitsOnly.slice(2)}`;
    const matched = SORTED_BY_DIAL_LENGTH.find((c) => withPlus.startsWith(c.dialCode));
    if (matched) {
      country = matched;
      national = digitsOnly.slice(2 + matched.dialCode.length - 1);
    }
  } else {
    const dialDigits = country.dialCode.slice(1);
    if (
      national.startsWith(dialDigits) &&
      national.length >= dialDigits.length + (country.minDigits ?? 6)
    ) {
      national = national.slice(dialDigits.length);
    }
  }

  // Strip trunk prefix leading zero (e.g., Kenya 0142590695 -> 142590695, UK 07700900123 -> 7700900123)
  // Note: Italy (+39) keeps leading zero on landlines, though mobile numbers start with 3.
  if (country.iso !== 'IT' && national.startsWith('0') && national.length > 6) {
    national = national.replace(/^0+/, '');
  }

  const e164 = `${country.dialCode}${national}`;
  const e164Valid = /^\+[1-9]\d{6,14}$/.test(e164);

  let error: string | undefined;
  if (!national) {
    error = 'Enter your phone number digits after the country code.';
  } else if (country.minDigits && national.length < country.minDigits) {
    error = `${country.name} (${country.dialCode}) numbers require at least ${country.minDigits} national digits.`;
  } else if (country.maxDigits && national.length > country.maxDigits) {
    error = `${country.name} (${country.dialCode}) numbers should not exceed ${country.maxDigits} national digits.`;
  } else if (!e164Valid) {
    error = 'Enter a valid global E.164 phone number (7 to 15 digits total including country code).';
  }

  return {
    country,
    nationalNumber: national,
    e164,
    isValid: Boolean(!error && e164Valid),
    error,
  };
}
