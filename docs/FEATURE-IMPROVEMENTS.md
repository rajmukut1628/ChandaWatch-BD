# অনুমোদিত ২০টি উন্নয়ন

| নম্বর | উন্নয়ন            | বর্তমান অবস্থা                                                                                                                                                              |
| ----- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ১     | সংবাদ ছবি/ভিডিও   | admin upload, cover, video badge/player; প্রকৃত পরিষ্কার scan আবশ্যক।                                                                                                       |
| ২     | বিভাগ             | গুরুত্বপূর্ণ, সতর্কতা, স্থানীয় ও সচেতনতা।                                                                                                                                   |
| ৩     | আটটি সংবাদ সাজানো | ক্রম অনুযায়ী প্রথম আটটি নির্বাচিত সংবাদ; বাকিগুলো archive।                                                                                                                  |
| ৪     | প্রকাশের preview  | বাংলা/ইংরেজি, মোবাইল/বড় পর্দা, ছবি/ভিডিও।                                                                                                                                   |
| ৫     | ছোট কার্ড         | চার/দুই/এক কলামের grid; সমান media জায়গা ও সীমিত লেখা।                                                                                                                      |
| ৬     | search            | আক্ষরিক শিরোনাম, বিভাগ, জেলা, শুরু/শেষ তারিখ; archive দশটি করে।                                                                                                             |
| ৭     | সম্পর্কিত সংবাদ   | একই বিভাগের সর্বোচ্চ চারটি প্রকাশযোগ্য সংবাদ।                                                                                                                               |
| ৮     | খালি পাতা         | ছোট empty state।                                                                                                                                                            |
| ৯     | ভাষা              | registered/static/accessible labels ও bilingual markup tests; admin location names এবং upload status ঠিক করা হয়েছে। ব্যবহারকারীর নাম/ফাইল/লেখা স্বয়ংক্রিয়ভাবে অনুবাদ হয় না। |
| ১০    | অনুবাদ সতর্কতা    | editor warning; backend অসম্পূর্ণ সংবাদ প্রকাশ আটকে দেয়।                                                                                                                    |
| ১১    | অভিযোগ জমা        | বিদ্যমান media preview, progress, retry/resume ও confirmation যাচাই।                                                                                                        |
| ১২    | লোকেশন            | বিদ্যমান district/upazila/union reset, filter removal ও parent validation যাচাই।                                                                                            |
| ১৩    | অগ্রগতি           | বিদ্যমান tracking/public timeline ও privacy gates যাচাই।                                                                                                                    |
| ১৪    | কাজের তালিকা      | admin dashboard: নতুন অভিযোগ, review, draft/scheduled news।                                                                                                                 |
| ১৫    | deletion          | নামসহ trash confirmation; ৩০ দিনের recovery; স্থায়ী deletion-এ typed slug ও revision লাগে।                                                                                  |
| ১৬    | মোবাইল            | responsive filters/cards/preview ও table scrolling; নতুন browser visual acceptance বাকি।                                                                                    |
| ১৭    | loading           | সর্বোচ্চ ৯৬০ পিক্সেল WebP cover, metadata re-encode, lazy images, deferred video, placeholders ও stale response reset।                                                      |
| ১৮    | নিরাপত্তা         | role/CSRF, type/size/scan, private evidence, lockout, literal search ও withdrawal tests; dependency audit।                                                                  |
| ১৯    | backup            | isolated empty DB/storage restore, BSON/date/binary equality, authenticated decryption এবং session invalidation পরীক্ষা।                                                    |
| ২০    | পূর্ণ প্রক্রিয়া   | intake → tracking → assignment/review → independent approval → public privacy/withdrawal integration suite।                                                                 |

## ব্যবহার

প্রশাসক: **সংবাদ ও তথ্য → সংবাদ ও গুরুত্বপূর্ণ তথ্য → নতুন যোগ**। দুই ভাষার লেখা, বিভাগ ও জেলা দিন। প্রয়োজন হলে প্রচ্ছদ/ভিডিও দিন। পূর্বরূপ দেখে ক্রম দিন, মূল পাতায় নির্বাচনের checkbox চালু করুন, তারপর প্রকাশ করুন। অন্তত আটটি প্রকাশযোগ্য সংবাদ নির্বাচন করলে আটটি কার্ড পূর্ণ হবে। পরীক্ষার সংবাদ মূল database-এ যোগ করা হয়নি।

## Media

ছবি ১০ মেগাবাইট; ভিডিও ২০০ মেগাবাইট। ছবি browser-এ ছোট WebP হিসেবে পুনরায় encode হয়। Media upload প্রকৃত ClamAV INSTREAM connection ব্যবহার করে। `CLAMAV_HOST`/`CLAMAV_PORT` এবং পর্যাপ্ত scanner stream limit প্রয়োজন। unavailable/infected ফল পেলে upload বন্ধ হয় ও temporary file সরানো হয়। Test protocol fixture আসল antivirus নয়। ব্যক্তিগত evidence স্বয়ংক্রিয়ভাবে সংবাদে প্রকাশিত হয় না।

Draft preview administrator-only; public handler-এ published, enabled, due news reference প্রয়োজন। Withdrawal-এর পরে নতুন request বন্ধ হয়; আগে download হওয়া অনুলিপি ফেরানো সম্ভব নয়। অসংযুক্ত পুরোনো media ৩০ দিন পরে retention job সরায়; version reference থাকলে রাখে।

Upload controls-এর ভিত্তি: [OWASP File Upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)।

## Backup ও যাচাই

আগের create/verify/restore commands বহাল। Backup key এবং মূল field-encryption keys নিরাপদে সংরক্ষণ করতে হবে। Restore DB ও storage দুটোই খালি হতে হবে; `CONFIRM_RESTORE=EMPTY_DATABASE` প্রয়োজন। Live database-এ restore করা হয়নি। Restore target-এ disk/network failure হলে target যাচাই করে পুনরায় প্রস্তুত করতে হবে।

শেষ `npm run check`: production build ও **৫৯/৫৯ পরীক্ষা পাস**। Production dependency audit: **০ vulnerabilities**। Frontend 5173 ও API 4000 HTTP 200। স্থানীয় scanner health check-এ সংযোগ পাওয়া যায়নি; media upload চালাতে প্রকৃত scanner সংযোগ প্রয়োজন। নতুন পর্দার interactive/mobile pixel যাচাই এখনো বাকি; responsive code ও rendered markup যাচাই হয়েছে। Live SMTP ও production hosting আলাদা runtime setup।
