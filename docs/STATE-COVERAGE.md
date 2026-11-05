# State filing coverage

_Generated from `data/filing/` by `scripts/state-coverage.ts`; `tests/state-coverage.test.ts` fails if this file is stale. Do not edit by hand._

**53 jurisdictions** (the 53 unemployment-tax agencies the US Department of Labor lists: 50 states, DC, Puerto Rico, US Virgin Islands). **53 have a state profile** (AK, AL, AR, AZ, CA, CO, CT, DC, DE, FL, GA, HI, IA, ID, IL, IN, KS, KY, LA, MA, MD, ME, MI, MN, MO, MS, MT, NC, ND, NE, NH, NJ, NM, NV, NY, OH, OK, OR, PA, PR, RI, SC, SD, TN, TX, UT, VA, VI, VT, WA, WI, WV, WY). The rest are **NOT MODELLED**: their own documents have not been read, and nothing is assumed about what they require. A row saying NOT MODELLED does not mean nothing is owed.

Unemployment reporting modelled for 13 of 53. Withholding deposits modelled for 34, partly for 10. New-hire reporting modelled for 2.

**Nothing is transmitted to any state.** No state transport is connected; the sandbox rehearses and says so, and live transports refuse with the enrollment steps each profile records.

| Code | Jurisdiction | UI tax agency (DOL directory) | Withholding | Unemployment | New hire |
| --- | --- | --- | --- | --- | --- |
| AL | Alabama | Department of Industrial Relations, 649 Monroe Street, Montgomery, AL 36131-0099 | modelled | NOT MODELLED | NOT MODELLED |
| AK | Alaska | Employment Security Tax, Dept of Labor and Workforce Development, PO Box 115509, Juneau, AK 99811-5509 | no wage income tax | modelled | NOT MODELLED |
| AZ | Arizona | Unemployment Tax - 911B, Department of Economic Security, PO Box 6028, Phoenix, AZ 85005-6028 | modelled | NOT MODELLED | NOT MODELLED |
| AR | Arkansas | Department of Workforce Services, PO Box 2981, Little Rock, AR 72203-2981 | modelled | NOT MODELLED | NOT MODELLED |
| CA | California | Account Services Group, MIC-90, Employment Development Department, PO Box 942880, Sacramento, CA 94280 | modelled | modelled | modelled |
| CO | Colorado | Unemployment Insurance Operations, Department of Labor and Employment, PO Box 8789, Denver, CO 80201-8789 | modelled | NOT MODELLED | NOT MODELLED |
| CT | Connecticut | Connecticut Department of Labor, 200 Folly Brook Blvd, Wethersfield, CT 61091-1114 | modelled | NOT MODELLED | NOT MODELLED |
| DE | Delaware | Division of Unemployment Insurance, Department of Labor, PO Box 9950, Wilmington, DE 19809-0950 | modelled | NOT MODELLED | modelled |
| DC | District of Columbia | Department of Employment Services, Office of Unemployment, Compensation Tax Division, 609 H Street NE, 3rd floor, Washington, DC 20001-4347 | modelled | NOT MODELLED | NOT MODELLED |
| FL | Florida | Unemployment Compensation Services, Agency for Workforce Innovation, 107 E. Madison St. MSC 229, Tallahassee, FL 32399-0180 | no wage income tax | modelled | NOT MODELLED |
| GA | Georgia | Department of Labor, 148 Andrew Young Inter Blvd, Suite 800, Atlanta, GA 30303-1732 | modelled | NOT MODELLED | NOT MODELLED |
| HI | Hawaii | Department of Labor and Industrial Relations, 830 Punchbowl Street, Room 437, Honolulu, HI 96813-5096 | modelled | NOT MODELLED | NOT MODELLED |
| ID | Idaho | Department of Labor, 317 W Main Street, Boise, ID 83735-0002 | partial | NOT MODELLED | NOT MODELLED |
| IL | Illinois | Department of Employment Security, 33 South State St, Chicago, IL 60603 | modelled | NOT MODELLED | NOT MODELLED |
| IN | Indiana | Department of Workforce Development, 10 North Senate Ave, Room SE 106, Indianapolis, IN 46204-2277 | modelled | NOT MODELLED | NOT MODELLED |
| IA | Iowa | Workforce Development, 1000 East Grand Avenue, Des Moines, IA 50319-0209 | partial | NOT MODELLED | NOT MODELLED |
| KS | Kansas | Department of Labor, 401 SW Topeka Blvd, Topeka, KS 66603-3182 | modelled | NOT MODELLED | NOT MODELLED |
| KY | Kentucky | Department for Employment Services, P. O. Box 948, Frankfort, KY 40602-0948 | modelled | NOT MODELLED | NOT MODELLED |
| LA | Louisiana | Louisiana Workforce Commission, PO Box 94094, Baton Rouge, LA 70804 | partial | NOT MODELLED | NOT MODELLED |
| ME | Maine | Department of Labor, PO Box 259, Augusta, ME 04332-0259 | modelled | NOT MODELLED | NOT MODELLED |
| MD | Maryland | Department of Labor, Licensing, & Regulation, 1100 North Eutaw St,, Room 414, Baltimore, MD 21201-2201 | partial | NOT MODELLED | NOT MODELLED |
| MA | Massachusetts | Division of Employment and Training, 19 Staniford Street, Boston, MA 02114-2589 | modelled | NOT MODELLED | NOT MODELLED |
| MI | Michigan | Department of Licensing and Regulatory Affairs, 3024 W Grand Blvd, Detroit, MI 48202-6024 | modelled | NOT MODELLED | NOT MODELLED |
| MN | Minnesota | Department of Employment & Economic Development, 332 Minnesota Street, Suite E200, St. Paul, MN 55101-1351 | modelled | NOT MODELLED | NOT MODELLED |
| MS | Mississippi | Department of Employment Security, PO Box 1699, Jackson, MS | modelled | NOT MODELLED | NOT MODELLED |
| MO | Missouri | Division of Employment Security, PO Box 59, Jefferson City, MO 65104-0059 | partial | NOT MODELLED | NOT MODELLED |
| MT | Montana | Unemployment Insurance Division, PO Box 6339, Helena, MT 59604-6339 | modelled | NOT MODELLED | NOT MODELLED |
| NE | Nebraska | Department of Labor, Box 94600, State House Station, Lincoln, NE 68509-4600 | modelled | NOT MODELLED | NOT MODELLED |
| NV | Nevada | Department of Employment Training and Rehabilitation, 500 East Third Street, Carson City, NV 89713-0030 | no wage income tax | modelled | NOT MODELLED |
| NH | New Hampshire | Department of Employment Security, 32 South Main Street, Concord, NH 03301-4857 | no wage income tax | modelled | NOT MODELLED |
| NJ | New Jersey | Department of Labor & Workforce Development, PO Box 947, Trenton, NJ 08625-0947 | modelled | NOT MODELLED | NOT MODELLED |
| NM | New Mexico | Department of Workforce Solutions, PO Box 2281, Albuquerque, NM 87103-2281 | partial | NOT MODELLED | NOT MODELLED |
| NY | New York | Department of Labor, State Campus, Building 12, Room 500, Albany, NY 12240-0339 | partial | modelled | NOT MODELLED |
| NC | North Carolina | Employment Security Commission, PO Box 26504, Raleigh, NC 27611-6504 | modelled | NOT MODELLED | NOT MODELLED |
| ND | North Dakota | Job Service of North Dakota, PO Box 5507, Bismarck, ND 58506-5507 | modelled | NOT MODELLED | NOT MODELLED |
| OH | Ohio | Department of Job & Family Services, PO Box 182404, Columbus, OH 43218-2404 | modelled | NOT MODELLED | NOT MODELLED |
| OK | Oklahoma | Employment Security Commission, PO Box 52003, Oklahoma City, OK 73152-2003 | partial | NOT MODELLED | NOT MODELLED |
| OR | Oregon | Employment Department, 875 Union Street NE, Room 107, Salem, OR 97311-0030 | modelled | NOT MODELLED | NOT MODELLED |
| PA | Pennsylvania | Dept of Labor and Industry, 7th and Forster Street, Room 915, Harrisburg, PA 17121-0001 | modelled | NOT MODELLED | NOT MODELLED |
| PR | Puerto Rico | Department of Labor and Human Resources, PO Box 1020, San Juan, PR 000919 | partial | modelled | NOT MODELLED |
| RI | Rhode Island | Division of Taxation, One Capitol Hill, Ste 36, Providence, RI 29085-5829 | modelled | NOT MODELLED | NOT MODELLED |
| SC | South Carolina | Employment Security Commission, PO Box 995, Columbia, SC 29202-0995 | modelled | NOT MODELLED | NOT MODELLED |
| SD | South Dakota | Department of Labor, PO Box 4730, Aberdeen, SD 57402-4730 | no wage income tax | modelled | NOT MODELLED |
| TN | Tennessee | Department of Labor and Workforce Development, 220 French Landing Drive, Nashville, TN 37243 | no wage income tax | modelled | NOT MODELLED |
| TX | Texas | Workforce Commission, PO Box 149037, Austin, TX 78714-9037 | no wage income tax | modelled | NOT MODELLED |
| UT | Utah | Department of Workforce Services, PO Box 45288, Salt Lake City, UT 84145-0288 | modelled | NOT MODELLED | NOT MODELLED |
| VT | Vermont | Department of Labor, PO Box 488, Montpelier, VT 05601-0488 | modelled | NOT MODELLED | NOT MODELLED |
| VI | Virgin Islands | Department of Labor, PO Box 302608, St. Thomas, VI 00803-2608 | partial | modelled | NOT MODELLED |
| VA | Virginia | Employment Commission, PO Box 1358, Richmond, VA 23218-1358 | modelled | NOT MODELLED | NOT MODELLED |
| WA | Washington | Employment Security Department, PO Box 9046, Olympia, WA 98507-9046 | no wage income tax | modelled | NOT MODELLED |
| WV | West Virginia | Bureau of Employment Programs, 112 California Avenue, Charleston, WV 25305-0016 | modelled | NOT MODELLED | NOT MODELLED |
| WI | Wisconsin | Department of Workforce Development, PO Box 7942, Madison, WI 57307-7942 | modelled | NOT MODELLED | NOT MODELLED |
| WY | Wyoming | Unemployment Tax Division, PO Box 2760, Casper, WY 82602-2760, Created: March 29, 2004, Updated: September 11, 2026, Frequently Asked Questions, / -->, Freedom of Information Act, /, Privacy & Security Statement, /, Disclaimers, / | no wage income tax | modelled | NOT MODELLED |

Withholding **partial** means the return and its due dates are modelled but the deposit schedule is not. **no wage income tax** means the registry records no wage income tax for that jurisdiction.
