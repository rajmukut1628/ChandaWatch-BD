# সুরক্ষিত প্রধান মালিক

একজন স্থায়ী প্রধান মালিক থাকে। প্রথম setup-এ প্রথম সক্রিয় administrator মালিক হন; existing installation-এ সবচেয়ে পুরোনো সক্রিয় administrator নির্বাচিত হয়। এরপর মালিকানার record database-এ থাকে, নতুন প্রশাসক তৈরি করলে মালিক বদলায় না। এই প্রকল্পে বর্তমান administrator Raj Mukut-এর account প্রথম administrator হলে সেটিই মূল মালিক হিসেবে থাকবে।

মূল মালিকের account অন্য administrator বা নিজের administrative controls দিয়ে delete, disable, role change, credential editing বা permission restriction করা যায় না। Server enforcement আছে; button disabled করাই একমাত্র সুরক্ষা নয়। নিজের password/account settings-এর নিয়মিত নিরাপদ পথ বহাল।

## মালিকানা পরিবর্তন

১. বর্তমান মালিক **কর্মী ও অনুমতি → প্রধান মালিকের নিয়ন্ত্রণ → মালিকানা পরিবর্তন করুন** খুলবেন।

২. সক্রিয় কর্মী account-এর email এবং নিজের বর্তমান password দিয়ে request করবেন। Password server-এ যাচাই হয়; সংরক্ষিত request/audit-এ রাখা হয় না।

৩. নির্ধারিত নতুন মালিক নিজের account-এ প্রবেশ করে **অ্যাকাউন্ট → প্রধান মালিকের নিয়ন্ত্রণ** থেকে নিজের password ও দায়িত্ব গ্রহণের checkbox দিয়ে গ্রহণ করবেন। অন্য কর্মী request গ্রহণ করতে পারবেন না।

৪. Request ২৪ ঘণ্টা বৈধ। গ্রহণের আগে বর্তমান মালিক বাতিল করতে পারবেন। অপেক্ষার সময়ে বর্তমান মালিক ও নির্ধারিত successor administrative mutation থেকে সুরক্ষিত থাকেন।

৫. গ্রহণ হলে নতুন মালিক administrator access এবং স্থায়ী owner protection পাবেন। পুরোনো মালিক administrator থাকেন; ভবিষ্যতে নতুন মালিক তার সাধারণ account permissions বদলাতে পারবেন। দুই account-এর পুরোনো sessions বাতিল হয়; আবার sign in করতে হবে।

Concurrent changes stale revision দিয়ে প্রত্যাখ্যাত হয়; acceptance একবারই হয়। Owner designation-এর compare-and-set **আগে** হয়, যাতে cancelled/stale request ক্ষমতা বাড়াতে না পারে। তারপর successor role update হয়; failed role update হলে designation rollback হয়। Database operation-এর মাঝখানে process crash হলে state যাচাই করে administrator recovery প্রয়োজন হতে পারে; এটি MongoDB multi-document transaction নয়।

## পরীক্ষা ও GitHub

Isolated integration test owner delete/disable/access restriction, uppercase ID, owner-only request, CSRF, দুই পক্ষের password, cancellation, expiry, successor promotion ও session invalidation যাচাই করে। মূল database-এ কোনো বাস্তব ownership transfer করা হয়নি।

GitHub upload-এ source, documentation, dependency lockfile ও tests থাকে। `.env`, encryption keys, private evidence, database, backups, generated build ও `.local` files excluded। Account passwords/publication evidence repository-তে রাখা হয় না।
