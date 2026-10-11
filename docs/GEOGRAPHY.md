# District, upazila and union data

The bundled `server/src/data/upazilas.json` contains 495 upazila entries linked to all 64 project district codes, with Bengali and English names. Source: [iqbalhasandev/bangladesh-geo-json](https://github.com/iqbalhasandev/bangladesh-geo-json), retrieved October 10, 2026. The source is an MIT-licensed community compilation, not a guarantee of current legal administrative boundaries. License retained in `GEOGRAPHY-LICENSE.txt`.

Aliases normalize Comilla/Cumilla, Barisal/Barishal and Jhalakathi/Jhalokathi to the existing project codes. The transformed dataset has unique district-prefixed upazila codes. API validation rejects mismatched district/upazila pairs. Metropolitan areas without an applicable upazila may select “Not specified / metropolitan area”. General area text remains encrypted and never supplies public geography.

Public upazila visibility requires explicit editorial permission and at least the configured privacy threshold of eligible, consented, independently approved reports in that upazila. Filters use only publicly visible geography. The map shows district centers only. No upazila coordinates or exact incident coordinates are inferred from reports.

`server/src/data/unions.json` contains 4,540 Bengali/English union entries from the same MIT-licensed community source, linked to district and upazila codes. Union codes are upazila-prefixed slugs. Intake and filters cascade district → upazila → union; mismatched parents are rejected. Unions are optional for municipal/metropolitan locations. Public union visibility requires explicit `displayUnion`, visible upazila and the minimum privacy group size; original area text remains private.
