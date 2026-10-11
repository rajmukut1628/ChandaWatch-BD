# ChandaWatch BD

প্রধান মালিকের সুরক্ষা ও দুই পক্ষের সম্মতিতে মালিকানা হস্তান্তর যুক্ত হয়েছে। [মালিকানা পরিচালনা](docs/OWNERSHIP.md) এবং [২০টি উন্নয়ন](docs/FEATURE-IMPROVEMENTS.md) দেখুন।

মূল পাতায় এখন প্রশাসক নির্বাচিত সংবাদ দেখায়। পুরোনো মূল পাতার বিষয়গুলো `/about`-এ আছে। [সংবাদ প্রকাশের পূর্ণ প্রক্রিয়া](docs/HOT-NEWS.md) দেখুন।

নির্বাচিত ১–৭২ feature-এর local implementation ও service setup-এর বিস্তারিত [delivery register](docs/FEATURE-DELIVERY.md)-এ আছে। Public summary `/summary`, saved cases `/bookmarks`, FAQ `/faq`; staff account/notification/priority/workload এবং admin content/access/feedback/settings/operations page যুক্ত হয়েছে। অসমাপ্ত upload একই ফাইল বেছে resume করা বা tracking/admin evidence form থেকে বাতিল করা যায়।

Production build এবং ৪৮টি automated test পাস করেছে। বাস্তব SMTP delivery, live ClamAV, production hosting এবং নতুন screen-এর browser acceptance যাচাই বাকি। কোনো system-কে সম্পূর্ণ hack-proof দাবি করা হচ্ছে না।

Blueprint অনুযায়ী MERN project এই folder-এ implement করা হয়েছে। Frontend, backend, database models, private evidence, tracking, staff email/password login, moderation, senior approval, map, analytics, admin, privacy request, backup/restore, retention এবং deployment configuration অন্তর্ভুক্ত আছে।

## চালানো

এই workspace-এ dependencies install এবং local configuration তৈরি করা আছে। Terminal-এ `npm run dev` চালালে frontend `http://localhost:5173` এবং API `http://localhost:4000`-এ চলবে। প্রথমবারের MongoDB binary-ও download করা হয়েছে।

প্রথম admin-এর নিজের email, নাম, password-এর জন্য `npm run bootstrap` আছে। কোনো shared default password দেওয়া হয়নি। Admin dashboard থেকে moderator এবং আলাদা senior reviewer তৈরি করা যাবে।

## যাচাই

Production build এবং ৩১টি test পাস করেছে। Encrypted backup আলাদা test database-এ restore করে যাচাই করা হয়েছে। Browser-এ fictional report submission ও private tracking পরীক্ষা করা হয়েছে। বিস্তারিত: [Validation](docs/VALIDATION.md)।

## বাস্তব launch

Local codebase তৈরি আছে। বাস্তব hosting, Atlas account, domain, HTTPS/WAF, ClamAV service ও operational schedules এখনও provision করা হয়নি। Blueprint-এর security audit, legal review ও incident response team-এর প্রস্তুতি code লিখে সম্পন্ন করা যায় না। সেই review শেষ না হওয়া পর্যন্ত production intake-এর launch gate বন্ধ রাখুন।

Evidence development mode-এ quarantine-এ থাকে; clean malware scan ছাড়া staff download বা publication approval সম্ভব নয়। Public statistics-এ sample বা মিথ্যা report count যোগ করা হয়নি। Privacy threshold-এর কারণে কম তথ্য থাকলে chart খালি থাকবে।

বিস্তারিত commands, API ও deployment runbook: [README](README.md)।

# নতুন Public view ও media ব্যবহার

মেনুর **ঘটনার চিত্র** অথবা `http://localhost:5173/incidents` খুলুন। প্রতি পাতায় সর্বশেষ প্রকাশিত ১০টি বিবরণ; বাকি ঘটনাগুলো **পরের page** দিয়ে দেখা যাবে। জেলা/উপজেলা/ইউনিয়ন, ধরন, মাস, অবস্থা, যাচাইয়ের ধরন ও বিবরণ দিয়ে ফিল্টার করা যায়। List/Map, পৃথক detail page এবং বাংলা/English view আছে। ছোট দলের উপজেলা ও ইউনিয়ন গোপন থাকে; ম্যাপ শুধু জেলার কেন্দ্র দেখায়।

**ঘটনা জানান** ফর্মে ছবি/ভিডিও বেছে preview দেখে জমা দিন। সর্বোচ্চ ৫টি; ছবি/ডকুমেন্ট/অডিও ১০ MB, ভিডিও ২০০ MB। জমার পর secret আগে সংরক্ষণ করুন; upload progress ও ব্যর্থ ফাইলের Retry দেখবেন। ফাইল ব্যর্থ হলে নতুন করে রিপোর্ট জমা দেবেন না। Original evidence সর্বদা private; public cards-এ category illustration থাকে।

প্রকাশের জন্য reporter-এর ঐচ্ছিক সম্মতি → assigned staff-এর পরিচয়মুক্ত public draft → অন্য senior/admin-এর privacy review ও অনুমোদন দরকার। Admin ও moderator একই ব্যক্তি হলে নিজে অনুমোদন দিতে পারবেন না। `reviewed` মানে অভিযোগ সত্য প্রমাণিত নয়। স্বাধীন যাচাইয়ের label দিতে যাচাইয়ের নিরাপদ বিবরণও দিতে হয়।

Tracking ID ও secret দিয়ে **ট্র্যাক করুন** থেকে public-story সম্মতি তুলে নিতে পারবেন; প্রকাশ্য account সঙ্গে সঙ্গে লুকাবে। আবার সম্মতি দিলে নতুন অনুমোদন লাগবে। Draft/status/evidence পরিবর্তনেও প্রকাশের অনুমোদন বাতিল হয়।

Admin dashboard-এ **Security monitoring** আছে। Admin ও Staff শুধু email–password দিয়ে login করেন; role অনুযায়ী dashboard খুলবে। পাঁচবার ভুল login-এ ১৫ মিনিট lock, ৩০ মিনিট inactive থাকলে session বন্ধ। বর্তমান development scanner quarantine রাখে; আসল ClamAV clean না করা পর্যন্ত প্রমাণ দেখা/প্রকাশ অনুমোদন হয় না। Production deployment, HTTPS, Atlas, real scanner এবং independent security audit আলাদা setup—কোনো সিস্টেমকে “hack করা অসম্ভব” বলা যায় না।

Admin `/staff/login` থেকে login করে রিপোর্ট যোগ/সংশোধন/মুছতে, প্রমাণ যোগ/মুছতে এবং staff account তৈরি/সম্পাদনা/মুছতে পারবেন। নিজের account মুছতে পারবেন না। Public information থেকে home, awareness, safety ও privacy পাতার অতিরিক্ত তথ্য draft/save/publish/delete করতে পারবেন। সংশোধনে আগের public approval বাতিল হয়; audit record সংরক্ষিত থাকে।
