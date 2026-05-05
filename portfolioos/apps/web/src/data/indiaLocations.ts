// India: 28 states + 8 UTs, with major cities per region.
// City lists target the most common ~25–35 places per state — enough for a useful
// dropdown. Combined with a free-text "Other" fallback, this covers nearly all
// real-world property entries without bundling a 100k-row geo DB.

export interface IndiaState {
  code: string;
  name: string;
  cities: readonly string[];
}

export const INDIA_STATES: readonly IndiaState[] = [
  {
    code: 'AN', name: 'Andaman and Nicobar Islands',
    cities: ['Port Blair', 'Diglipur', 'Mayabunder', 'Rangat', 'Havelock'],
  },
  {
    code: 'AP', name: 'Andhra Pradesh',
    cities: ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Tirupati', 'Rajahmundry', 'Kakinada', 'Anantapur', 'Kadapa', 'Eluru', 'Ongole', 'Chittoor', 'Machilipatnam', 'Srikakulam', 'Vizianagaram'],
  },
  {
    code: 'AR', name: 'Arunachal Pradesh',
    cities: ['Itanagar', 'Naharlagun', 'Pasighat', 'Tezu', 'Bomdila', 'Tawang', 'Ziro', 'Aalo'],
  },
  {
    code: 'AS', name: 'Assam',
    cities: ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat', 'Nagaon', 'Tinsukia', 'Tezpur', 'Bongaigaon', 'Karimganj', 'Sivasagar', 'Goalpara', 'Barpeta', 'North Lakhimpur', 'Diphu'],
  },
  {
    code: 'BR', name: 'Bihar',
    cities: ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga', 'Purnia', 'Bihar Sharif', 'Arrah', 'Begusarai', 'Katihar', 'Munger', 'Chhapra', 'Saharsa', 'Hajipur', 'Sasaram', 'Dehri', 'Siwan', 'Motihari', 'Nawada', 'Bagaha'],
  },
  {
    code: 'CG', name: 'Chhattisgarh',
    cities: ['Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Durg', 'Rajnandgaon', 'Jagdalpur', 'Raigarh', 'Ambikapur', 'Dhamtari', 'Mahasamund', 'Kanker'],
  },
  {
    code: 'CH', name: 'Chandigarh',
    cities: ['Chandigarh'],
  },
  {
    code: 'DH', name: 'Dadra and Nagar Haveli and Daman and Diu',
    cities: ['Daman', 'Diu', 'Silvassa'],
  },
  {
    code: 'DL', name: 'Delhi',
    cities: ['New Delhi', 'Delhi', 'North Delhi', 'South Delhi', 'East Delhi', 'West Delhi', 'Central Delhi', 'Dwarka', 'Rohini', 'Pitampura', 'Saket', 'Karol Bagh', 'Connaught Place'],
  },
  {
    code: 'GA', name: 'Goa',
    cities: ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa', 'Ponda', 'Bicholim', 'Curchorem', 'Sanguem', 'Canacona', 'Calangute', 'Anjuna'],
  },
  {
    code: 'GJ', name: 'Gujarat',
    cities: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Junagadh', 'Gandhinagar', 'Anand', 'Navsari', 'Morbi', 'Mehsana', 'Bharuch', 'Vapi', 'Gandhidham', 'Veraval', 'Porbandar', 'Godhra', 'Patan', 'Surendranagar', 'Bhuj', 'Valsad', 'Nadiad'],
  },
  {
    code: 'HR', name: 'Haryana',
    cities: ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Yamunanagar', 'Rohtak', 'Hisar', 'Karnal', 'Sonipat', 'Panchkula', 'Bhiwani', 'Sirsa', 'Bahadurgarh', 'Jind', 'Thanesar', 'Kaithal', 'Rewari', 'Palwal'],
  },
  {
    code: 'HP', name: 'Himachal Pradesh',
    cities: ['Shimla', 'Manali', 'Dharamshala', 'Solan', 'Mandi', 'Kullu', 'Hamirpur', 'Una', 'Bilaspur', 'Chamba', 'Nahan', 'Kangra', 'Palampur', 'Sundernagar'],
  },
  {
    code: 'JK', name: 'Jammu and Kashmir',
    cities: ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Sopore', 'Kathua', 'Udhampur', 'Punch', 'Rajouri', 'Pulwama', 'Kupwara', 'Doda'],
  },
  {
    code: 'JH', name: 'Jharkhand',
    cities: ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Hazaribagh', 'Deoghar', 'Giridih', 'Ramgarh', 'Phusro', 'Medininagar', 'Chaibasa', 'Dumka'],
  },
  {
    code: 'KA', name: 'Karnataka',
    cities: ['Bengaluru', 'Mysuru', 'Hubballi-Dharwad', 'Mangaluru', 'Belagavi', 'Davanagere', 'Ballari', 'Vijayapura', 'Shivamogga', 'Tumakuru', 'Raichur', 'Bidar', 'Hassan', 'Udupi', 'Hospet', 'Gadag-Betigeri', 'Kolar', 'Mandya', 'Chikkamagaluru', 'Chitradurga', 'Bagalkot'],
  },
  {
    code: 'KL', name: 'Kerala',
    cities: ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam', 'Palakkad', 'Alappuzha', 'Kannur', 'Kottayam', 'Kasaragod', 'Malappuram', 'Pathanamthitta', 'Idukki', 'Wayanad', 'Ernakulam'],
  },
  {
    code: 'LA', name: 'Ladakh',
    cities: ['Leh', 'Kargil', 'Diskit', 'Nubra', 'Zanskar'],
  },
  {
    code: 'LD', name: 'Lakshadweep',
    cities: ['Kavaratti', 'Agatti', 'Minicoy', 'Andrott', 'Kalpeni'],
  },
  {
    code: 'MP', name: 'Madhya Pradesh',
    cities: ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Dewas', 'Satna', 'Ratlam', 'Rewa', 'Murwara', 'Singrauli', 'Burhanpur', 'Khandwa', 'Bhind', 'Chhindwara', 'Guna', 'Shivpuri', 'Vidisha', 'Damoh', 'Mandsaur', 'Khargone', 'Neemuch', 'Hoshangabad', 'Itarsi', 'Sehore', 'Betul', 'Seoni'],
  },
  {
    code: 'MH', name: 'Maharashtra',
    cities: ['Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad', 'Solapur', 'Amravati', 'Kolhapur', 'Vasai-Virar', 'Navi Mumbai', 'Kalyan-Dombivli', 'Sangli', 'Jalgaon', 'Akola', 'Latur', 'Dhule', 'Ahmednagar', 'Chandrapur', 'Parbhani', 'Ichalkaranji', 'Jalna', 'Bhusawal', 'Panvel', 'Satara', 'Beed', 'Yavatmal', 'Osmanabad', 'Nanded', 'Wardha', 'Ratnagiri'],
  },
  {
    code: 'MN', name: 'Manipur',
    cities: ['Imphal', 'Thoubal', 'Bishnupur', 'Churachandpur', 'Ukhrul', 'Senapati', 'Tamenglong', 'Chandel'],
  },
  {
    code: 'ML', name: 'Meghalaya',
    cities: ['Shillong', 'Tura', 'Jowai', 'Nongstoin', 'Williamnagar', 'Baghmara', 'Resubelpara', 'Mawkyrwat'],
  },
  {
    code: 'MZ', name: 'Mizoram',
    cities: ['Aizawl', 'Lunglei', 'Champhai', 'Saiha', 'Kolasib', 'Serchhip', 'Lawngtlai', 'Mamit'],
  },
  {
    code: 'NL', name: 'Nagaland',
    cities: ['Kohima', 'Dimapur', 'Mokokchung', 'Tuensang', 'Wokha', 'Mon', 'Phek', 'Zunheboto', 'Kiphire', 'Longleng', 'Peren'],
  },
  {
    code: 'OD', name: 'Odisha',
    cities: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur', 'Puri', 'Balasore', 'Bhadrak', 'Baripada', 'Jharsuguda', 'Jeypore', 'Bargarh', 'Rayagada', 'Bhawanipatna', 'Dhenkanal', 'Angul', 'Kendrapara'],
  },
  {
    code: 'PY', name: 'Puducherry',
    cities: ['Puducherry', 'Karaikal', 'Yanam', 'Mahe', 'Ozhukarai', 'Villianur'],
  },
  {
    code: 'PB', name: 'Punjab',
    cities: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali', 'Hoshiarpur', 'Pathankot', 'Moga', 'Abohar', 'Malerkotla', 'Khanna', 'Phagwara', 'Muktsar', 'Barnala', 'Rajpura', 'Firozpur', 'Kapurthala', 'Sangrur', 'Mansa'],
  },
  {
    code: 'RJ', name: 'Rajasthan',
    cities: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner', 'Bhilwara', 'Alwar', 'Sikar', 'Pali', 'Sri Ganganagar', 'Tonk', 'Hanumangarh', 'Bharatpur', 'Beawar', 'Kishangarh', 'Sawai Madhopur', 'Banswara', 'Jhunjhunu', 'Churu', 'Dholpur', 'Nagaur', 'Chittorgarh', 'Mount Abu'],
  },
  {
    code: 'SK', name: 'Sikkim',
    cities: ['Gangtok', 'Namchi', 'Gyalshing', 'Mangan', 'Rangpo', 'Singtam', 'Jorethang'],
  },
  {
    code: 'TN', name: 'Tamil Nadu',
    cities: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Tiruppur', 'Vellore', 'Erode', 'Thoothukudi', 'Dindigul', 'Thanjavur', 'Ranipet', 'Sivakasi', 'Karur', 'Udhagamandalam', 'Hosur', 'Nagercoil', 'Kanchipuram', 'Kumbakonam', 'Cuddalore', 'Tiruvannamalai', 'Pollachi', 'Rajapalayam', 'Pudukkottai', 'Neyveli', 'Nagapattinam'],
  },
  {
    code: 'TG', name: 'Telangana',
    cities: ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam', 'Ramagundam', 'Mahbubnagar', 'Nalgonda', 'Adilabad', 'Suryapet', 'Miryalaguda', 'Siddipet', 'Jagtial', 'Mancherial', 'Nirmal', 'Kothagudem'],
  },
  {
    code: 'TR', name: 'Tripura',
    cities: ['Agartala', 'Udaipur', 'Dharmanagar', 'Kailasahar', 'Belonia', 'Khowai', 'Ambassa', 'Sabroom'],
  },
  {
    code: 'UP', name: 'Uttar Pradesh',
    cities: ['Lucknow', 'Kanpur', 'Ghaziabad', 'Agra', 'Varanasi', 'Meerut', 'Prayagraj', 'Bareilly', 'Aligarh', 'Moradabad', 'Saharanpur', 'Gorakhpur', 'Noida', 'Firozabad', 'Loni', 'Jhansi', 'Muzaffarnagar', 'Mathura', 'Shahjahanpur', 'Rampur', 'Mau', 'Farrukhabad', 'Hapur', 'Etawah', 'Mirzapur', 'Bulandshahr', 'Sambhal', 'Amroha', 'Hardoi', 'Fatehpur', 'Raebareli', 'Orai', 'Sitapur', 'Bahraich', 'Modinagar', 'Unnao', 'Jaunpur', 'Lakhimpur', 'Hathras', 'Banda', 'Pilibhit', 'Mughalsarai', 'Barabanki', 'Khurja', 'Gonda', 'Mainpuri', 'Lalitpur', 'Etah', 'Deoria', 'Ujhani', 'Ghazipur', 'Sultanpur', 'Azamgarh', 'Bijnor', 'Sahaswan', 'Basti', 'Chandausi', 'Akbarpur', 'Ballia', 'Tanda', 'Greater Noida', 'Shikohabad', 'Shamli', 'Awagarh', 'Kasganj'],
  },
  {
    code: 'UK', name: 'Uttarakhand',
    cities: ['Dehradun', 'Haridwar', 'Roorkee', 'Haldwani', 'Rudrapur', 'Kashipur', 'Rishikesh', 'Mussoorie', 'Nainital', 'Almora', 'Pithoragarh', 'Pauri', 'Ramnagar', 'Tehri', 'Khatima', 'Manglaur'],
  },
  {
    code: 'WB', name: 'West Bengal',
    cities: ['Kolkata', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri', 'Bardhaman', 'Malda', 'Baharampur', 'Habra', 'Kharagpur', 'Shantipur', 'Dankuni', 'Dhulian', 'Ranaghat', 'Haldia', 'Raiganj', 'Krishnanagar', 'Nabadwip', 'Medinipur', 'Jalpaiguri', 'Balurghat', 'Basirhat', 'Bankura', 'Chakdaha', 'Darjeeling', 'Alipurduar', 'Purulia', 'Jangipur', 'Bolpur', 'Bangaon', 'Cooch Behar'],
  },
] as const;

export function citiesForState(stateName: string | null | undefined): readonly string[] {
  if (!stateName) return [];
  const s = INDIA_STATES.find((x) => x.name.toLowerCase() === stateName.toLowerCase());
  return s ? s.cities : [];
}
