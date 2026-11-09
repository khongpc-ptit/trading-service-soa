# **1\. Project Overview**

Mục đích để agent hiểu toàn cảnh trước khi đọc từng service.

1\. Project Overview  
   1.1. Mục tiêu hệ thống  
   1.2. Phạm vi MVP  
   1.3. Đối tượng sử dụng  
   1.4. Business flow chính  
   1.5. Các actor (FARMER//TRADER//ADMIN)

Ví dụ:

System: Agriculture Management Platform  
   
Target:  
\- Farmer  
\- Trader  
\- Admin  
   
Platform:  
\- Web  
\- Mobile  
   
Architecture:  
\- Microservices  
   
Main services:  
1\. User Service  
2\. Farming Service  
3\. Trading Service  
4\. Chat Service  
5\. Payment Service  
6\. Notification Service  
---

# **2\. Architecture Overview (P.CƯỜNG LÀM)**

**![][image1]**

\`\`\`dbdiagram

@startuml

\!theme plain

skinparam componentStyle rectangle

skinparam linetype ortho

skinparam nodesep 50

skinparam ranksep 60

skinparam defaultTextAlignment center

 

' Định nghĩa bảng chú giải (Legend)

legend right

  \|= Ký hiệu / Màu sắc \|= Ý nghĩa / Giao thức \|

  \|\<\#E8F5E9\>\| \*\*MVP\*\* (Bắt buộc Phase 1\) \|

  \|\<\#FFF3E0\>\| \*\*Optional\*\* (Phase mở rộng) \|

  \| \<color:blue\>---\>\</color\> \| RESTful API (Đồng bộ) \|

  \| \<color:red\>\<...\>\</color\> \| Kafka Event (Bất đồng bộ) \|

  \| \<color:purple\>===\>\</color\> \| WebSocket (Real-time) \|

endlegend

 

actor "User\\n(farmer / trader / admin )" as User

component "Web / Mobile App" as App \<\<MVP\>\> \#E8F5E9

User \<--\> App

 

' \================= TẦNG GATEWAY \=================

package "API & Discovery Layer" {

    component "API Gateway" as APIGW \<\<REST / WS\>\> \<\<MVP\>\> \#E8F5E9

    component "Service Discovery\\n(Eureka/Consul)" as Discovery \<\<Optional\>\> \#FFF3E0

   

    ' Ép Discovery nằm bên phải Gateway để không vướng đường nối

    APIGW \-\[hidden\]r- Discovery

}

 

App \<--\> APIGW : HTTPS

APIGW .r.\> Discovery : Lookup

 

' \================= TẦNG MESSAGE BROKER \=================

queue "Message Broker (Kafka)\\n\<size:12\>Event-Driven\</size\>" as Kafka \<\<MVP\>\> \#E8F5E9

 

' \================= TẦNG MICROSERVICES \=================

package "Microservices Layer (Implement Hexagonal \+ Clean Architecture )" as MicroservicesLayer {

   

    ' Khai báo các Services

    component "User Service" as UserService \<\<MVP\>\> \#E8F5E9

    component "Farming Service\\n\<size:12\>(CQRS)\</size\>" as FarmingService \<\<MVP\>\> \#E8F5E9

    component "Trading Service\\n\<size:12\>(CQRS)\</size\>" as TradingService \<\<MVP\>\> \#E8F5E9

    ' Contract là module trong PaymentService, không tạo component/deployment riêng

    component "Payment Service" as PaymentService \<\<MVP\>\> \#E8F5E9

    component "Notification Service" as NotifService \<\<MVP\>\> \#E8F5E9

    component "Chat Service" as ChatService \<\<MVP\>\> \#E8F5E9

 

    ' Khai báo các Databases

    database "User DB" as UserDB \#E8F5E9

    database "Farming DB" as FarmingDB \#E8F5E9

    database "Trading DB" as TradingDB \#E8F5E9

    ' Contract/Deposit/Dispute cùng payment\_db của Payment

    database "Payment DB" as PaymentDB \#E8F5E9

    database "Notification DB" as NotifDB \#E8F5E9

    database "Chat DB" as ChatDB \#E8F5E9

 

    ' Nối Database trực tiếp xuống dưới đáy của từng Service

    UserService \-d-\> UserDB

    FarmingService \-d-\> FarmingDB

    TradingService \-d-\> TradingDB

    ' Không chốt Contract DB/deployment

    PaymentService \-d-\> PaymentDB

    NotifService \-d-\> NotifDB

    ChatService \-d-\> ChatDB

   

    ' Ép các Service nằm thành 1 hàng ngang (tránh xô lệch)

    UserService \-\[hidden\]r- FarmingService

    FarmingService \-\[hidden\]r- TradingService

TradingService \-\[hidden\]r- ChatService

ChatService \-\[hidden\]r- PaymentService

    PaymentService \-\[hidden\]r- NotifService

    NotifService \-\[hidden\]r- ChatService

}

 

' \-----------------------------------------------------------

' CÁC ĐƯỜNG NỐI

' \-----------------------------------------------------------

 

' 1\. Luồng từ Gateway gọi XUỐNG Services (-d-\>)

APIGW \-\[\#blue\]d-\> UserService : REST

APIGW \-\[\#blue\]d-\> FarmingService : REST

APIGW \-\[\#blue\]d-\> TradingService : REST

' Route Contract theo owner/deployment cần nhóm xác nhận

APIGW \-\[\#blue\]d-\> PaymentService : REST

APIGW \-\[\#blue\]d-\> NotifService : REST /api/v1/notifications/\*\*

APIGW \-\[\#blue\]d-\> ChatService : REST /api/v1/conversations/\*\*

APIGW \==\[\#purple\]d==\> ChatService : WS

 

' 2\. Luồng Services đăng ký LÊN Discovery (.u.\>)

UserService .u.\> Discovery : Reg

FarmingService .u.\> Discovery : Reg

TradingService .u.\> Discovery : Reg

' Contract là module nội bộ, không đăng ký service discovery riêng

PaymentService .u.\> Discovery : Reg

 

' 3\. Luồng Kafka Bất đồng bộ (Gom thành 1 đường duy nhất)

' Nối trực tiếp từ toàn bộ Package Microservices lên Kafka

Kafka \<..\[\#red\]d..\> MicroservicesLayer : pub/sub

@enduml

 

\`\`\`

---

# **3\. Service Responsibility**

Tạo một bảng cực kỳ rõ:

| Service | Responsibility | Database | Owner |
| ----- | ----- | ----- | ----- |
| User | Authentication, Authorization, Profile | user\_db | Member 4 |
| Farming | Plot, Season, Cultivation, Cost | farming\_db | Member 1 |
| Trading | Listing, Offer; RFQ chưa thuộc MVP đã chốt | trading\_db | Member 2 |
| Chat | Conversation, Message | chat\_db | Member 3 |
| Payment | Điều phối cọc, xác nhận Payment; không ghi DB Trading | payment\_db | Owner Payment/Contract (chưa ghi tên thành viên) |
| Notification | Notification & Event Consumer | notification\_db | Member 4 |

### **Quy tắc quan trọng**

Mỗi service phải có:

OWN DATABASE  
OWN BUSINESS LOGIC  
OWN API (GHI RÕ TỪNG API)

Service khác **không được truy cập database trực tiếp**.

---

# **4\. Database Ownership**

Đây là phần agent code rất cần.

Với mỗi service ghi:

Service  
Database  
Entities  
PK  
FK  
Relationships  
Data ownership  
External references

## **User Service**

user\_db  
   
accounts  
farmer\_profiles  
trader\_profiles  
email\_verification\_otps  
refresh\_tokens

## **Notification Service**

notification\_db  
   
notifications (event\_id, recipient\_id UUID; UNIQUE pair)

Và phải ghi rõ:

recipient\_id  
	↓  
logical reference  
	↓  
user\_db.accounts.account\_id  
   
NOT a database FK.  
---

# **5\. ERD của từng Service**

**Nên có ERD riêng cho từng service**, không chỉ một ERD toàn hệ thống.

Ví dụ:

5.1 User Service ERD  
5.2 Farming Service ERD  
5.3 Trading Service ERD  
5.4 Chat Service ERD  
5.5 Payment Service ERD; Contract/Deposit/Dispute thuộc payment\_db theo Contract v2.1  
5.6 Notification Service ERD

Mỗi ERD nên kèm:

●      Entity  
●      Attribute  
●      PK  
●      FK  
●      Cardinality

Và đặc biệt:

> Không có FK xuyên database.

---

# **6\. API Contract**

Đây là **trái tim của document**.

Đừng chỉ ghi:

GET /users

Mà phải ghi đầy đủ:

Method  
Endpoint  
Authentication  
Request  
Response  
Status Code  
Error Response  
Owner  
Consumer

Ví dụ:

## **GET Trader**

GET /api/v1/traders/{traderId}

### **Owner**

User Service

### **Consumer**

Trading Service

###  

### **Response**

{  
  "accountId": "22222222-2222-4222-8222-222222222222",  
  "displayName": "ABC Rice",  
  "avatarUrl": null,  
  "province": "An Giang",  
  "district": null,  
  "joinedAt": "\<ISO-8601 UTC\>"  
}  
---

# **7\. API Contract Matrix**

Ngoài API chi tiết, cần một bảng tổng hợp:

| From | To | Method | Endpoint | Purpose | Sync/Async |
| ----- | ----- | ----- | ----- | ----- | ----- |
| Trading | User | GET | `/api/v1/traders/{traderId}` | Get trader | Sync |
| Trading | Farming | GET | `/api/v1/plots/{plotId}/summary — snapshot Farming, caller Trading có service auth/ownership` | Get crop info | Sync |
| Contract | Trading | GET | `/api/v1/offers/{offerId} — module Contract/Payment là caller; kiểm scope nội bộ/participant` | Get accepted Offer; không tự thêm Negotiation | Sync |
| Chat | User | GET | `/api/v1/users/{accountId}` | Validate user | Sync |

Agent nhìn bảng này là biết service mình được phép gọi service nào.

---

# **8\. Event Contract**

Kafka đã được chốt cho MVP; mỗi event liên service phải tuân thủ contract chung.

Ví dụ:

OFFER\_CREATED  
OFFER\_ACCEPTED  
MESSAGE\_CREATED  
CONTRACT\_CREATED  
CONTRACT\_STATUS\_CHANGED

Mỗi event:

Event Name  
Producer  
Consumers  
Trigger  
Payload

Ví dụ:

### **`OFFER_CREATED`**

{  
  "eventId": "uuid",  
  "eventType": "OFFER\_CREATED",  
  "occurredAt": "datetime",  
  "data": {  
    "offerId": "uuid",  
   
    "listingId": "uuid",  
    "farmerId": "uuid",  
    "traderId": "uuid"  
  }  
}

Producer:

Trading Service

Consumer:

Notification Service  
---

# **9\. Authentication & Authorization**

Phần này đặc biệt quan trọng vì **User Service là service của Phong**.

Phải quy định:

JWT  
Access Token  
Role  
Authorization

Ví dụ:

POST /auth/login  
   	↓  
User Service  
   	↓  
JWT  
   	↓  
Client  
   	↓  
Authorization: Bearer \<token\>

Role:

FARMER  
TRADER  
ADMIN

Và bảng quyền:

| Endpoint | Farmer | Trader | Admin |
| ----- | ----- | ----- | ----- |
| Create Plot | ✓ | ✗ | ✗ |
| Create Listing | ✓ | ✗ | ✗ |
| Send Offer | ✗ | ✓ | ✗ |
| Manage User | ✗ | ✗ | ✓ |

---

# **10\. Error Contract**

Cực kỳ nên thống nhất từ đầu.

Tất cả service trả lỗi cùng format:

{  
  "timestamp": "2026-09-23T10:00:00Z",  
  "status": 400,  
  "code": "VALIDATION\_ERROR",  
  "message": "Invalid request",  
  "path": "/api/v1/plots"  
}

Các code:

VALIDATION\_ERROR  
UNAUTHORIZED  
FORBIDDEN  
NOT\_FOUND  
CONFLICT  
INTERNAL\_SERVER\_ERROR  
SERVICE\_UNAVAILABLE

Nếu không thống nhất cái này thì mỗi service sẽ trả một kiểu JSON, lúc frontend ghép vào sẽ khá đau đầu.

---

# **11\. Data Contract**

Ngoài API, cần thống nhất (THỐNG NHẤT KIỂU DỮ LIỆU TRONG CÁC DATABASE)

### **ID**

UUID

### **Time**

ISO 8601  
UTC

### **Naming**

camelCase

Ví dụ:

{  
  "plotId": "...",  
  "createdAt": "..."  
}

### **Database**

snake\_case

Ví dụ:

plot\_id  
created\_at  
---

# **12\. State Machine**

Các entity có trạng thái phải ghi rõ.

Đặc biệt:

## **Contract**

CREATED  
 ↓  
PENDING\_DEPOSIT  
 ↓  
ACTIVE  
 ↓  
COMPLETED

Không được:

ACTIVE → COMPLETED; CANCELLED chỉ qua kết luận xử lý hợp lệ. Deposit LOCKED không phải Contract status; không tự quay Listing LOCKED về OPEN.

nếu business không cho phép.

Tương tự:

Listing  
RFQ  
Offer  
Negotiation  
CropSeason  
---

# **13\. Business Rules**

Đây là phần giúp agent **không tự bịa nghiệp vụ**.

Ví dụ:

BR-FS-001:  
Một Account chỉ có một Role.  
   
BR-(SERVICE NAME)-002:  
Một Farmer có thể quản lý nhiều Plot.  
   
BR-003:  
Một Plot có nhiều Crop Season.  
   
BR-004:  
Một Crop Season có thể phát sinh nhiều Cost.  
   
BR-005:  
Service không được truy cập trực tiếp database của service khác.

Đánh ID cho business rule:

BR-001  
BR-002  
...

Rất tiện khi review code.

---

# **14\. Inter-Service Communication**

Ghi rõ service nào dùng:

### **Synchronous**

REST API

### **Asynchronous**

Message Broker

Ví dụ:

Trading  
   │  
   │ GET crop summary  
   ▼  
Farming

Trong khi:

Trading  
   │  
   │ OFFER\_CREATED  
   ▼  
Message Broker  
   │  
   ▼  
Notification  
---

# **15\. Repository Structure**

Đây là phần agent code cực kỳ cần. (CẤU TRÚC CÁ NHÂN)

Ví dụ:

![][image2]  
---

# **16\. Coding Convention**

Code theo môi hình Client \- Server (Bỏ Client vì đã có Repo Frontend làm Client chung)

Phần này giúp 4 agent code không thành **4 phong cách khác nhau**.

Ví dụ Java/Spring Boot:

controller/  
service/  
repository/  
entity/  
dto/  
mapper/  
exception/  
config/  
security/

Ví dụ:

PlotController  
PlotService  
PlotRepository  
Plot  
CreatePlotRequest  
PlotResponse

Quy định:

Controller  
	↓  
Service  
	↓  
Repository  
	↓  
Database

Không:

Controller → Repository  
---

# **17\. Git Convention**

main  
develop

Branch:

feature/user-auth  
feature/user-profile  
   
feature/farming-plot  
feature/farming-season  
   
feature/trading-listing  
   
feature/chat-message  
   
feature/contract-state  
   
feature/notification-consumer

Commit:

feat:  
fix:  
refactor:  
test:  
docs:  
chore:

Ví dụ:

feat(user): implement login API  
feat(farming): add crop season CRUD  
feat(notification): consume OFFER\_CREATED event  
---

# **18\. Environment Configuration**

Ghi rõ các biến môi trường.

Ví dụ User:

SERVER\_PORT=8081  
   
DB\_URL=  
DB\_USERNAME=  
DB\_PASSWORD=  
   
JWT\_ALGORITHM=RS256; JWT\_ISSUER=urn:soa:user-service; JWT\_AUDIENCE=soa-api; JWT\_PUBLIC\_KEY\_LOCATION=\<public key\>; ACCESS\_STATE\_TIMEOUT\_MS=1000  
JWT\_ACCESS\_TTL=900s; RS256; iss=urn:soa:user-service; aud=soa-api

Notification:

SERVER\_PORT=8086  
   
DB\_URL=  
DB\_USERNAME=  
DB\_PASSWORD=  
   
KAFKA\_BOOTSTRAP\_SERVERS=

**Không commit secret vào Git.**

---

# **19\. Docker / Local Development**

Agent phải biết chạy project như thế nào.

Ví dụ:

docker compose up \-d

Các container:

api-gateway  
user-service  
farming-service  
trading-service  
chat-service  
payment-service (MVP); Contract là module trong Payment, không service/database riêng  
notification-service  
database...  
message-broker

Và port:

| Service | Port |
| ----- | ----- |
| Gateway | 8080 |
| User | 8081 |
| Farming | 8082 |
| Trading | 8083 |
| Chat | 8084 |
| Payment (module Contract) | 8085 — Payment, Contract là module nội bộ |
| Notification | 8086 |

---

# **20\. Testing Strategy//**

---

# **21\. End-to-End Business Flow**

Phần này để agent hiểu **tại sao nó đang code API đó**.

Ví dụ:

Farmer  
 ↓  
Create Plot  
 ↓  
Create Crop Season  
 ↓  
Cultivation Log  
 ↓  
Harvest  
 ↓  
Create Listing  
 ↓  
Trader views Listing  
 ↓  
Offer  
 ↓  
Notification  
 ↓  
Farmer accept Offer → OFFER\_ACCEPTED → Chat mở conversation theo offerId  
 ↓  
Hai participant trao đổi trong Chat  
 ↓  
Payment điều phối Contract/Deposit mô phỏng5%; Listing LOCKED sau chốt cọc, SOLD khi Contract hoàn tất; tranh chấp giữ cọc.  
 ↓  
Notification

Ghi rõ service nào tham gia ở từng bước.

---

# **22\. Definition of Done//**

   
---

# **23\. Phần đặc biệt dành cho AI Agent**

Tôi **rất khuyên thêm một chương riêng**:

# **AI AGENT DEVELOPMENT RULES**

Đây là thứ giúp huynh đưa document cho Cursor / Claude Code / Codex / các agent khác.

Ví dụ:

RULE-001  
Không tạo entity mới nếu không có trong Business Specification.  
   
RULE-002  
Không truy cập database của service khác.  
   
RULE-003  
Không thay đổi API Contract mà chưa cập nhật contracts/.  
   
RULE-004  
Không thay đổi Event Contract mà chưa thông báo các consumer.  
   
RULE-005  
Không hard-code credentials.  
   
RULE-006  
Không bypass authentication.  
   
RULE-007  
Mọi business logic phải nằm trong Service Layer.  
   
RULE-008  
Controller không chứa business logic.  
   
RULE-009  
Không tạo FK xuyên database.  
   
RULE-010  
Nếu requirement chưa rõ → đánh dấu CẦN XÁC NHẬN, không tự suy đoán.

Đặc biệt thêm:

BEFORE CODING  
   
Agent MUST:  
1\. Read this document.  
2\. Identify the service it is working on.  
3\. Read that service's database schema.  
4\. Read related API contracts.  
5\. Read related event contracts.  
6\. Check business rules.  
7\. Only then implement code.  
---

# **24\. Cấu trúc document cuối cùng**

Nếu là tôi tổ chức tài liệu cho nhóm huynh, tôi sẽ chốt thành:

AGRICULTURE MICROSERVICE  
SYSTEM DEVELOPMENT SPECIFICATION  
│  
├── 01\. Project Overview  
├── 02\. Scope & MVP  
├── 03\. System Architecture  
├── 04\. Microservice Responsibilities  
├── 05\. Database Ownership  
├── 06\. ERD  
├── 07\. Business Rules  
├── 08\. API Contract  
├── 09\. Event Contract  
├── 10\. Authentication & Authorization  
├── 11\. State Machines  
├── 12\. Inter-Service Communication  
├── 13\. Data & Naming Convention  
├── 14\. Repository Structure  
├── 15\. Coding Convention  
├── 16\. Error Handling  
├── 17\. Git Workflow  
├── 18\. Environment Configuration  
├── 19\. Docker & Local Development  
├── 20\. Testing Strategy//  
├── 21\. End-to-End Business Flows  
├── 22\. Definition of Done//  
├── 23\. AI Agent Development Rules  
└── 24\. Change Log

### **Quan trọng nhất**

Huynh nên xem document này là **"single source of truth" của cả nhóm**.

                BA  
              	↓  
          Business Rules  
              	↓  
            Architecture  
              	↓  
       Database \+ API Contract  
              	↓  
          Event Contract  
              	↓  
              CODE  
              	↓  
             TESTING  
 

# **Quy định đồng bộ bắt buộc**

Nguồn cập nhật: Conflict đã chốt, Contract chung v2.1 và xulycontract(1).txt; người dùng đã giao quyền lựa chọn phương án và cập nhật trực tiếp. D01–D07 và gói kỹ thuật có hiệu lực theo v2.1. Ưu tiên quyết định mới nhất → Conflict đã chốt → Contract → rule → spec; không dùng đề xuất cũ để mở lại các mục đã đóng.

6 service luồng chính:User, Farming, Trading, Chat, Payment, Notification. Contract / Deposit / tranh chấp thuộc Payment/payment\_db; User sở hữu reputation/account status. Không query/FK xuyên DB, REST/Kafka theo contract.

User DB: accounts/farmer\_profiles/trader\_profiles/email\_verification\_otps/refresh\_tokens. Một role FARMER/TRADER/ADMIN; public register chỉ FARMER/TRADER UNVERIFIED, OTP→ACTIVE; ADMIN seed có kiểm soát. LOCKED/INACTIVE thu hồi refresh và chặn protected request mới ngay dù JWT cũ còn hạn; state unavailable fail closed. Gateway verify và backend kiểm danh tính/ownership; không tin header client.

User public profile chỉ ID/displayName/avatar/Tỉnh/Huyện/joinedAt; không contacts chi tiết/OTP/hash/token/rating/badge. Private profile chỉ chính account; Trader ACTIVE không phải chờ Admin duyệt.

Envelope đã duyệt: {eventId UUID, eventType, eventVersion:1, sourceService, occurredAt UTC, actorId UUID\|null, recipientIds:\[account UUID\], referenceType, referenceId UUID, correlationId?, data}. Producer giữ eventId/payload qua retry; consumer ghi DB trước ACK. 7 event giao thương ban đầu giữ tên; xulycontract bổ sung REPUTATION\_CHANGED, ACCOUNT\_LOCKED, ACCOUNT\_UNLOCKED từ User. USER\_PROFILE\_UPDATED chỉ đồng bộ Trading, không thuộc subscription Notification. Notification không tự tính điểm từ trạng thái cọc. Topic/key đã chốt theo Contract v1: soa.trading.offer.v1/offerId; soa.chat.message.v1/conversationId; soa.contract.lifecycle.v1/contractId (producer payment-service); soa.payment.deposit.v1/depositId. Group Notification notification-service-v1; Chat OFFER\_ACCEPTED dùng chat-offer-accepted-v1, độc lập Notification. CONTRACT\_CREATED và CONTRACT\_STATUS\_CHANGED gửi \[farmerId, traderId\]; DEPOSIT\_PAID và DEPOSIT\_STATUS\_CHANGED gửi cả hai; MESSAGE\_CREATED chỉ người nhận. Reference MESSAGE=CONVERSATION/conversationId. DEPOSIT\_STATUS\_CHANGED chuyển LOCKED không tạo Notification, chỉ DEPOSIT\_PAID thông báo lần nạp đó.

Notification có4API own account; ADMIN không đọc người khác, trả404. Mark-read idempotent; page0/size20/max100,isRead/type,sort createdAt DESC/notificationId DESC,90ngày. Receipts đã duyệt; mọi recipients cùng transaction;retry5/30/120s,DLT7ngày.3event User theo TXT có contract áp dụng ở v2.1 §9/§14.

Chat mở sau OFFER\_ACCEPTED, không listing\_id; badge Chat độc lập. Payment Contract/cọc5% mô phỏng, REST chốt1 Listing, không sửa trading\_db. Farming cropType/GPS/kg/m², chọn cropSeasonId/backfill theo v2.1 §7; User/reputation và media theo §9–12/§17–19 đều có hiệu lực.

## **CONTRACT CHUNG MVP v2.1 — baseline triển khai của BA \- SOA**

Ngày: 07/10/2026. Phạm vi: User, Farming, Trading, Chat, Payment (gồm Contract/Deposit/Dispute), Notification và API Gateway.

## **1\. Hiệu lực và cách sử dụng**

BASELINE v2.1: người dùng đã giao quyền chọn phương án phù hợp MVP và thực hiện trực tiếp. Các quyết định D01–D07, gói kỹ thuật v2 và các mục bổ sung 17–19 dưới đây có hiệu lực trong tài liệu; không còn chờ duyệt. Đây là yêu cầu để triển khai, không phải xác nhận mã nguồn đã triển khai hoặc đã kiểm thử.

Ưu tiên: quyết định người dùng mới nhất → Conflict đã chốt → Contract v2.1 → rule → service spec. Giữ các quyết định 1–16 và TXT đã thống nhất; các khoảng trống được đóng bằng baseline này. Khi sửa giao tiếp phải đồng bộ producer, consumer, Gateway, DTO, schema, flow và test. Giữ 7 tab hiện có và công nghệ backend từng service; không đổi Farming Node.js/Express sang Spring.

## **2\. Ownership và phạm vi đã chốt**

Owner: User • Sở hữu và quyết định: Account, role/status, OTP/refresh, public/private profile, reputation và lịch sử điểm • Không được làm: Đọc payment\_db hoặc tự kết luận vi phạm Contract

Owner: Farming • Sở hữu và quyết định: Plot, Crop Season, Farming Log, Cost; giống/GPS/sản lượng • Không được làm: Đọc user\_db/trading\_db

Owner: Trading • Sở hữu và quyết định: Listing, Offer, chốt độc quyền một giao dịch/Listing, hai User replica • Không được làm: Ghi DB Payment hoặc tính điểm uy tín

Owner: Chat • Sở hữu và quyết định: Conversation/Message, trạng thái đọc/badge; card tham chiếu Contract • Không được làm: Tự sửa Contract/cọc hoặc dùng badge Notification thay badge Chat

Owner: Payment • Sở hữu và quyết định: Module Contract, Deposit, Dispute; kết luận xử lý qua Admin; cọc mô phỏng • Không được làm: Ghi trading\_db/user\_db; tự coi tiền mua lúa ngoài app đã thanh toán

Owner: Notification • Sở hữu và quyết định: Notification, receipt dedup, template, REST current account • Không được làm: Tính reputation hoặc suy người nhận khi producer thiếu recipientIds

Owner: Gateway • Sở hữu và quyết định: Route, verify JWT, kiểm access-state ở biên • Không được làm: Public internal endpoint, tin header identity/service-key do client gửi

Contract dùng payment\_db, không deployment/database/port riêng. Mỗi owner tự tạo UUID và chỉ ghi database của mình. FK chỉ nội bộ một database. Liên service dùng REST hoặc Kafka theo contract.

## **3\. Quy ước dữ liệu và HTTP**

UUID String xuyên API/event; accountId=farmerId hoặc traderId của profile tương ứng. JSON camelCase, DB snake\_case; UTC ISO8601; DB TIMESTAMPTZ. Tiền là decimal string, ví dụ "4600000.00", currency VND; không float. Đơn vị Farming: sản lượng kg, diện tích m², GPS decimal degrees.

Quyết định kỹ thuật v2.1: tiền VND làm tròn đến đồng bằng HALF\_UP tại lúc tạo nghĩa vụ cọc; API vẫn biểu diễn hai chữ số thập phân .00. Cọc đã accept giữ snapshot, không tính lại từ Contract bị sửa sau đó. Chính sách làm tròn áp dụng thống nhất cho Contract mới; không tính lại snapshot đã accept.

Success trả DTO, 204 không body. Error: {timestamp,status,code,message,path,traceId?}. Không stack trace/SQL/secret.

HTTP: 400 • Code chung: VALIDATION\_ERROR • Ý nghĩa: Sai input, enum, UUID, pagination

HTTP: 401 • Code chung: UNAUTHORIZED / INVALID\_CREDENTIALS / INVALID\_REFRESH\_TOKEN • Ý nghĩa: Thiếu/sai/hết hạn credential

HTTP: 403 • Code chung: FORBIDDEN / ACCOUNT\_NOT\_ACTIVE • Ý nghĩa: Sai quyền hoặc account không ACTIVE

HTTP: 404 • Code chung: NOT\_FOUND / ACCOUNT\_NOT\_FOUND • Ý nghĩa: Không có resource; Notification người khác cũng 404

HTTP: 409 • Code chung: INVALID\_STATE\_TRANSITION / IDEMPOTENCY\_CONFLICT • Ý nghĩa: Sai state hoặc cùng idempotency key nhưng khác request

HTTP: 413 • Code chung: PAYLOAD\_TOO\_LARGE • Ý nghĩa: Ảnh vượt 5 MiB

HTTP: 429 • Code chung: RATE\_LIMITED • Ý nghĩa: Vượt giới hạn, có Retry-After

HTTP: 503 • Code chung: ACCESS\_STATE\_UNAVAILABLE / DEPENDENCY\_UNAVAILABLE • Ý nghĩa: Chưa xác định được dependency; không tiếp tục nghiệp vụ

HTTP: 500 • Code chung: INTERNAL\_SERVER\_ERROR • Ý nghĩa: Lỗi không mong đợi

Danh sách page-based: page=0, size=20, max100; {items,page,size,totalElements,totalPages}. Giữ filter nghiệp vụ hiện có. Sort mặc định createdAt DESC,id DESC; feed Trading giữ khoảng cách GPS tăng dần rồi listingId làm tie-breaker. Chat/Payment giữ cursor, limit20/max100, mới nhất trước/ID tie-breaker; không biến cursor thành offset. Chat conversation dùng updatedAt/conversationId, messages dùng createdAt/messageId; Payment deposits dùng createdAt/paymentTrackingId. Cursor opaque gồm cặp sort key, không mang quyền truy cập.

## **4\. Security và User API đã chốt**

RS256, access token15phút; iss=urn:soa:user-service, aud=soa-api; claims sub UUID,role,iat,exp,jti. Chỉ User giữ private key. Gateway/backend dùng public key, validate signature/exp/iss/aud; giữ Bearer gốc và kiểm ownership. Client header x-user-id/x-user-role không có thẩm quyền.

GET /internal/v1/accounts/{accountId}/access-state: User đọc primary DB, không cache ACTIVE, Cache-Control:no-store. Response200 {accountId,status,role,accessAllowed}. Gateway/backend dùng accountId từ sub đã verify. Timeout tổng1giây hoặc User không truy cập được → protected request503 ACCESS\_STATE\_UNAVAILABLE. LOCKED/INACTIVE/UNVERIFIED →403. Không lấy Kafka propagation làm cơ chế khóa tức thời.

Internal xác thực X-Service-Key riêng từng caller, allowlist endpoint và private network/HTTPS deployment. Không route /internal/ public, không tạo role SERVICE trong accounts. Chat kiểm trạng thái trước SEND/SUBSCRIBE và push riêng tư; hết hạn token phải xác thực lại.

OTP6 số/10phút/5 lần sai; resend60s, tối đa5 mã/giờ/email. SMTP thuộc User; OTP không qua Kafka Notification. Refresh opaque7ngày, DB hash, rotate trong transaction. Login/refresh trả TokenPair JSON gồm refreshToken; refresh/logout nhận {refreshToken}; logout kiểm token thuộc account đang đăng nhập. Client giữ cả hai token trong bộ nhớ theo §17; không dùng cookie/localStorage/sessionStorage cho token ở MVP.

Admin seed phải OTP email trước ACTIVE; chưa có API tạo thêm ADMIN. Public register chỉ FARMER/TRADER. Profile công khai chỉ Bearer ACTIVE, target FARMER/TRADER ACTIVE; whitelist {accountId,displayName,avatarUrl,province,district,joinedAt}. Không public contacts, reputation, rating hoặc badge khi chưa duyệt mở rộng whitelist. Admin PATCH profile không nhận role/email/password; cấm tự khóa/xóa mình hoặc Admin ACTIVE cuối cùng. Audit quản trị dùng log bảo mật, không tự thêm bảng audit Admin.

## **5\. Luồng giao dịch và state đã chốt**

## **1\. Farmer tạo Listing từ snapshot Farming. Trader tạo Offer PENDING; depositAmount=0.**

2\. OFFER\_CREATED thông báo Farmer. Farmer có thể accept nhiều Offer, mỗi OFFER\_ACCEPTED tạo một conversation idempotent theo offerId và thông báo Trader.

3\. Trader tạo Contract trong Payment; Farmer accept → PENDING\_DEPOSIT và tạo một payment\_tracking PENDING. Accept không khóa Listing.

4\. Trader nạp cọc mô phỏng5% Contract. Payment phối hợp Trading chốt độc quyền một giao dịch/Listing; không dùng Kafka eventual delivery làm cơ chế chống hai Trader cùng thắng.

5\. Trading LOCKED; Payment Contract ACTIVE/cọc LOCKED sau khi kết quả chốt và lưu bền vững thành công. Payment phát event đúng contract; Offer.depositAmount cập nhật từ kết quả Payment đã xác nhận.

6\. Trader xác nhận hoàn tất → Contract COMPLETED; Trading SOLD. Mốc deliveryDate+24h chỉ mở quyền rút, không tự COMPLETED hoặc cộng điểm.

7\. Farmer rút khi đủ điều kiện và không có tranh chấp hợp lệ OPEN/UNDER\_REVIEW. Mở tranh chấp/job24h/release phải kiểm soát đồng thời trên cùng tracking.

Contract: CREATED→PENDING\_DEPOSIT→ACTIVE→COMPLETED; CANCELLED theo quyết định xử lý hợp lệ. Deposit: PENDING→LOCKED→RELEASABLE→RELEASED; FORFEITED/REFUNDED khi xử lý vi phạm. Listing: OPEN→LOCKED→SOLD; không tự LOCKED→OPEN. Offer/phòng khác giữ lịch sử, không tự REJECT/xóa tất cả; không cho chốt giao dịch thứ hai. Admin chỉ settlement FORFEITED/REFUNDED từ LOCKED hoặc RELEASABLE; tài khoản bị khóa không làm mất quyền lợi. Terminal deposit không bị chi lại.

## **6\. Quyết định kỹ thuật v2.1 — ID và REST chốt độc quyền**

ID thống nhất: depositId \= paymentId \= paymentTrackingId \= payment\_tracking.payment\_tracking\_id trong MVP vì chỉ có một tracking/cọc cho mỗi Contract, chưa có entity giao dịch gateway riêng. Đây là các alias DTO của cùng UUID, không tạo ba bản ghi/ID. ContractId là ID khác. API cọc hiện nhận {contractId} vẫn giữ tên/path đó, không đổi nghĩa âm thầm.

Payment chỉ gọi Trading bằng service key riêng; Trading derive listingId từ offerId, kiểm Offer ACCEPTED, đúng participant và Contract. Không nhận listingId do client khai làm nguồn sự thật.

API thống nhất: POST /internal/v1/offers/{offerId}/deposit-commit • Request: {contractId,paymentTrackingId,depositAmount,currency}; Idempotency-Key=paymentTrackingId • Response và idempotency: 200 {offerId,listingId,contractId,paymentTrackingId,listingStatus:"LOCKED"}; cùng key/body trả kết quả đã ghi; key khác đã thắng Listing→409 LISTING\_ALREADY\_COMMITTED

API thống nhất: GET /internal/v1/offers/{offerId}/deposit-commit • Request: Query contractId,paymentTrackingId • Response và idempotency: 200 kết quả chốt;404 chưa có;403 caller không được phép

Recovery: Payment tạo tracking cùng ý định nạp bền vững trước REST; một attempt dùng cùng trackingId. Trading khóa row Listing và lưu winningContractId/winningPaymentTrackingId trong cùng transaction LOCKED. Nếu response mất hoặc Payment crash sau Trading commit, recovery đọc kết quả và hoàn tất tracking/Contract; retry không tạo attempt mới. Chưa biết kết quả trả503, không trả nạp thành công và không tự thả Listing cho người khác. Nếu Trading trả409 đã có winner khác, tracking vẫn PENDING và không ghi paidAt/DEPOSIT\_PAID. Không có API thả claim trong MVP; recovery luôn hoàn tất cùng tracking đã thắng. Khi dependency lỗi, giữ trạng thái đang đối soát và retry cùng key; không cho một giao dịch thứ hai thắng.

Trading consume DEPOSIT\_PAID để cập nhật depositAmount nhưng không dùng event này để tranh quyền thắng. Trading consume CONTRACT\_STATUS\_CHANGED, chỉ COMPLETED của winningContractId mới chuyển SOLD; event muộn/version cũ không rollback state.

## **7\. Quyết định kỹ thuật v2.1 — Farming snapshot**

Giữ GET /api/v1/plots/{plotId}/summary, không /api/farming/crops/{id}/profile. Thêm query cropSeasonId để caller chọn rõ mùa vụ; Farming kiểm cropSeason.plotId khớp Plot. Trading dùng service key và identity Farmer đã verify; Farming trả farmerId để Trading kiểm owner trước tạo Listing.

Response200:

{"plotId":"UUID","farmerId":"UUID","area":2500.5,"latitude":10.123,"longitude":106.456,"currentSeason":{"cropSeasonId":"UUID","cropType":"ST25","expectedYield":1500}}

crop\_seasons.crop\_type VARCHAR(100), required khi tạo mùa vụ mới; Plot latitude\[-90,90\],longitude\[-180,180\]. Dùng NUMERIC(9,6) cho GPS; expectedYield kg,area m². Trading map cropType→seedType,expectedYield→estimated\_yield,latitude/longitude→plot\_lat/plot\_lng và giữ snapshot.

Backfill: thêm cột nullable cho dữ liệu cũ, yêu cầu Farmer/owner bổ sung từ dữ liệu thực; không tự gán ST25 hoặc tọa độ0,0. Chặn tạo Listing từ snapshot thiếu cropType/GPS/expectedYield bằng409 SNAPSHOT\_INCOMPLETE. Sau khi backfill và kiểm dữ liệu mới, mới siết constraint phù hợp. GET snapshot không tự chọn mùa vụ mới nhất khi caller thiếu cropSeasonId.

Trading tạo Listing: POST /api/v1/listings, FARMER ACTIVE; request {plotId,cropSeasonId,expectedPrice} với UUID và expectedPrice là decimal string VND dương. farmerId lấy từ sub, không nhận snapshot/owner do client tự khai. Trading gọi Farming summary với cropSeasonId, kiểm farmerId và giữ crop\_season\_id/seed\_type/estimated\_yield/area/GPS snapshot theo field mapping hiện có. Response201 {listingId,farmerId,plotId,cropSeasonId,seedType,estimatedYield,area,latitude,longitude,expectedPrice,status:"OPEN"}; 400 validation,403 owner/role,409 SNAPSHOT\_INCOMPLETE,503 dependency. Listing schema bổ sung crop\_season\_id logical ref; không FK cross-service.

## **7.1. PATCH, visibility và phạm vi Farming**

PATCH /api/v1/logs/{logId}: body là tập con không rỗng của {workType,workDate,description,quantity,unit}. PATCH /api/v1/costs/{costId}: tập con không rỗng của {category,amount,incurredDate,description}. Field vắng giữ nguyên; description được null để xóa, các field khác gửi null trả 400\. Reject field ngoài allowlist, gồm farmerId/plotId/cropSeasonId/ID/status/isVisible. Giữ enum/domain của create DTO, không tự thêm loại hoạt động/chi phí. Response 200 là DTO đầy đủ giống create, thêm isVisible; amount là decimal string. Quyền FARMER ACTIVE và owner; không có 404, không đúng owner 403, validation 400, account-state lỗi 503\. Hai endpoint PUT Log/Cost được thay bằng PATCH; PUT Plot/Crop Season giữ nguyên.

plots/farming\_logs/costs có is\_visible BOOLEAN NOT NULL DEFAULT true; API isVisible. PATCH /visibility {isVisible:boolean} idempotent trả 200 {id tương ứng,isVisible}. Không physical-delete/cascade; danh sách và report thông thường chỉ lấy dữ liệu visible, owner GET detail vẫn đọc được dữ liệu đã ẩn. Ẩn Plot không sửa snapshot Listing/Contract cũ; không tạo snapshot mới từ Plot ẩn. Không thêm filter nghiệp vụ mới. Danh sách có page=0,size=20,max100, createdAt DESC rồi ID DESC; feed Trading riêng theo khoảng cách GPS.

CROP\_SEASON\_COMPLETED/FARMING\_LOG\_CREATED/COST\_CREATED không phát Kafka trong MVP vì chưa có consumer nghiệp vụ; các bản payload cũ chỉ là lịch sử ngoài phạm vi triển khai. Farming phục vụ Trading bằng REST snapshot; không có API User→Farming mới. Không bắt buộc Farming chạy Kafka producer/outbox khi không phát event.

## **8\. Kafka envelope chung**

Envelope đã duyệt: {eventId,eventType,eventVersion:1,sourceService,occurredAt,actorId?,recipientIds,referenceType,referenceId,correlationId?,data}. eventId/referenceId/accountIds là UUID String. occurredAt UTC. actorId null cho system; correlationId phục vụ trace, không authorize/dedup.

Event Notification phải có ít nhất một recipientId; producer xác định người nhận, consumer loại trùng, không query DB producer để đoán. Event nghiệp vụ riêng User/Trading không vào subscription Notification. Payload không chứa password,OTP,token,contact riêng tư hoặc message body.

Event: OFFER\_CREATED • Producer / topic / key: trading-service / soa.trading.offer.v1 / offerId • Consumers: Notification • data tối thiểu / reference / recipients: offerId,listingId,farmerId,traderId; OFFER/offerId; Farmer

Event: OFFER\_ACCEPTED • Producer / topic / key: trading-service / soa.trading.offer.v1 / offerId • Consumers: Chat,Notification • data tối thiểu / reference / recipients: cùng DTO Offer; OFFER/offerId; Trader

Event: MESSAGE\_CREATED • Producer / topic / key: chat-service / soa.chat.message.v1 / conversationId • Consumers: Notification • data tối thiểu / reference / recipients: messageId,conversationId,senderId,recipientId; CONVERSATION/conversationId; không sender

Event: CONTRACT\_CREATED • Producer / topic / key: payment-service / soa.contract.lifecycle.v1 / contractId • Consumers: Chat,Notification • data tối thiểu / reference / recipients: contractId,offerId,farmerId,traderId,status; CONTRACT/contractId; cả hai

Event: CONTRACT\_STATUS\_CHANGED • Producer / topic / key: payment-service / soa.contract.lifecycle.v1 / contractId • Consumers: Chat,Notification; Trading COMPLETED theo baseline v2.1 • data tối thiểu / reference / recipients: contractId,farmerId,traderId,previousStatus,status,stateVersion; CONTRACT/contractId; cả hai

Event: DEPOSIT\_PAID • Producer / topic / key: payment-service / soa.payment.deposit.v1 / depositId • Consumers: Trading,Notification • data tối thiểu / reference / recipients: depositId,paymentId,contractId,farmerId,traderId,amount,currency; DEPOSIT/depositId; cả hai

Event: DEPOSIT\_STATUS\_CHANGED • Producer / topic / key: payment-service / soa.payment.deposit.v1 / depositId • Consumers: Notification • data tối thiểu / reference / recipients: depositId,contractId,farmerId,traderId,previousStatus,status,stateVersion; DEPOSIT/depositId; cả hai

DEPOSIT\_PAID chỉ sau cọc mô phỏng/chốt/lưu thành công. Notification không tạo thêm thông báo từ DEPOSIT\_STATUS\_CHANGED chuyển LOCKED. Contract ACTIVE có thể có thông báo Contract riêng, nhưng nội dung không lặp “đã nạp cọc” lần nữa. Đổi điều khoản không đổi status không được giả thành CONTRACT\_STATUS\_CHANGED; MVP client refresh Contract qua GET, chưa thêm TERMS\_UPDATED event.

## **9\. Quyết định kỹ thuật v2.1 — User replica và reputation events**

Giữ hai bảng farmer\_replicas/trader\_replicas. Public profile event thêm version phục vụ chống out-of-order; đây là metadata kỹ thuật, không mở rộng whitelist dữ liệu cá nhân.

Event: USER\_PROFILE\_UPDATED (tên đã có trong spec) • Topic / key: soa.user.profile.v1 / accountId • Consumer: Trading • Payload: {accountId,role,profileVersion,publicVisible,profile:{displayName,avatarUrl,province,district,joinedAt}}

Event: CONTRACT\_REPUTATION\_DECIDED (tên cụ thể hóa luồng TXT) • Topic / key: soa.payment.reputation-decision.v1 / accountId • Consumer: User • Payload: {decisionId,decisionVersion,originalDecisionId?,contractId,accountId,counterpartyId,action,violationCode?,requestedDelta,reasonCode,effectiveAt}

Event: REPUTATION\_CHANGED (TXT đã nêu) • Topic / key: soa.user.reputation.v1 / accountId • Consumer: Notification • Payload: {accountId,contractId,decisionId,action,delta,beforeScore,afterScore,reasonCode}

Event: ACCOUNT\_LOCKED (TXT đã nêu) • Topic / key: soa.user.account.v1 / accountId • Consumer: Notification • Payload: {accountId,reasonCode,accountVersion}

Event: ACCOUNT\_UNLOCKED (TXT đã nêu) • Topic / key: soa.user.account.v1 / accountId • Consumer: Notification • Payload: {accountId,reasonCode,accountVersion}

Profile event khi ACTIVE/public profile đổi; khi profile không còn được hiển thị, phát publicVisible=false,profile=null, không tiết lộ lý do khóa/trạng thái riêng tư. Trading ẩn replica và giữ version; event muộn không phục hồi dữ liệu đã ẩn. Bootstrap bằng job User phát lại snapshot hiện hành, không cho Trading đọc user\_db. Token/access-state vẫn quyết định quyền tức thời.

Decision action PENALTY,REVERSAL,COMPLETION\_REWARD. Payment xác nhận quyết định; User tự validate mã/mức điểm, kiểm dedup, clamp điểm0–10, lưu actual delta. REVERSAL tham chiếu quyết định gốc; một quyết định đảo chỉ được áp dụng một lần. Không nhận delta từ client hoặc Notification. Thay quyết định phải tạo version và liên kết gốc; không sửa lịch sử đã áp dụng.

REPUTATION\_CHANGED dùng referenceType ACCOUNT/referenceId accountId, recipient=\[accountId\]. ACCOUNT\_LOCKED/UNLOCKED tương tự. Group Trading profile: trading-user-profile-v1; User decision:user-reputation-decision-v1; Notification:notification-service-v1; Chat offer:chat-offer-accepted-v1; Chat Contract:chat-contract-v1. Mỗi nghiệp vụ consumer dùng group riêng.

## **10\. Quyết định kỹ thuật v2.1 — schema tối thiểu và reliability**

User: accounts.reputation\_score NUMERIC(3,1), check0..10 và bước0,5 cho FARMER/TRADER, ADMIN null; account\_version/profile\_version BIGINT; phân biệt admin\_lock và reputation\_lock, không để mở khóa một nguyên nhân xóa nguyên nhân khác. reputation\_history lưu history\_id,account\_id,counterparty\_id,contract\_id,decision\_id,decision\_version,original\_decision\_id,action,requested\_delta,actual\_delta,before\_score,after\_score,reason\_code,created\_at. Phạt/reversal unique(decision\_id,account\_id,action); thưởng unique(contract\_id,account\_id,COMPLETION\_REWARD). Các khóa account/history chỉ nội bộ user\_db.

Payment: contracts/payment\_tracking giữ schema hiện có; thêm version và trạng thái giữ cọc dispute\_hold độc lập deposit status. Bổ sung disputes,dispute\_evidence,dispute\_decisions để lưu hồ sơ, bằng chứng và quyết định bất biến. Một Contract chỉ có một tranh chấp đang mở tại một thời điểm; bổ sung bằng chứng vào hồ sơ đó. Deposit/Contract không trở thành account status.

Trading: winner contract/tracking trên Listing để bảo vệ độc quyền; replica có profile\_version/public\_visible. Notification: notification\_receipts đã duyệt, PK(event\_id,recipient\_id),processed\_at,payload\_hash; không tự xóa.

Outbox: mỗi DB producer cần lưu event cùng transaction business, relay publish rồi đánh dấu; giữ eventId/payload khi retry. Chat dùng transactional outbox với MongoDB replica set (dev một node). PostgreSQL producer lưu outbox cùng transaction nghiệp vụ. Migration/collection này thuộc baseline cần triển khai; không dùng publish-after-save thay thế outbox.

User khóa row account, kiểm business key, ghi history/cập nhật score/lock/thu hồi refresh cùng transaction; commit trước ACK. Consumer không chỉ dedup eventId: business key bảo vệ cả khi producer tạo nhầm eventId mới. REVERSAL lấy dấu ngược actual\_delta của bản ghi gốc, clamp 0–10 và lưu actual\_delta mới; áp dụng cho cả hủy phạt và thu hồi thưởng sai. Không nhận số điểm đảo do client khai. Unique(original\_decision\_id,account\_id,REVERSAL) ngăn hai decision mới cùng đảo một quyết định gốc. Thiếu bản ghi gốc thì retry/DLT để xử lý thứ tự, không ACK rồi bỏ qua.

Notification retry5/30/120s sau lần đầu; T.notification-retry-1/2/3 và T.notification-dlt, retention7ngày. Forward thành công mới commit offset; lỗi forward không drop record. Nội dung90ngày, receipts không tự xóa. Hash canonical envelope loại retry headers; same eventId khác payload→DLT EVENT\_ID\_REUSED. DLT replay có kiểm soát, không log-and-discard.

## **11\. Tranh chấp và quyền Admin — nội dung đã chốt từ TXT**

Participant gửi lý do/mô tả/bằng chứng; Payment mở OPEN và giữ cọc. Admin chuyển UNDER\_REVIEW, xem hồ sơ/Contract/cọc/bằng chứng, lấy phản hồi bên còn lại. Chỉ quyết định có bằng chứng mới làm phát sinh phạt. Không tự phạt bên im lặng hoặc quên bấm complete. Một hành vi một mức phạt chính; giả bằng chứng độc lập có thể xử lý riêng.

OPEN/UNDER\_REVIEW chặn mở quyền rút và release kể cả đã qua+24h hoặc trước đó RELEASABLE. Mở hồ sơ/job24h/complete/release cùng khóa row tracking và kiểm hold ngay trước commit. Account bị khóa không tự mất cọc/hủy Contract khác. Admin thực hiện quyết định xử lý qua quyền riêng, không giả danh participant gọi API release.

## **12\. Quyết định nghiệp vụ D01–D07 có hiệu lực**

ID: D01 • Quyết định áp dụng: Phản hồi trong 48 giờ từ lúc Payment chuyển UNDER\_REVIEW và ghi responseDueAt; xét thưởng sau 72 giờ từ completedAt. Hồ sơ mở trong hạn giữ thưởng đến khi giải quyết; im lặng không tự nhận thua. • Ảnh hưởng: Payment,User

ID: D02 • Quyết định áp dụng: F04 trừ2 khi vi phạm nhưng có thể khắc phục và cuối cùng hoàn tất; trừ3 khi không khắc phục và dẫn đến hủy do Farmer. Không cộng thêm F06 cho cùng hành vi. • Ảnh hưởng: Decision validation,User

ID: D03 • Quyết định áp dụng: Contract mới dùng penaltyRate=20 (% depositAmount), phải hiển thị và được hai bên accept; không tự áp 30%. Contract cũ giữ điều khoản đã accept, thiếu điều khoản thì không áp hồi tố. penaltyAmount=depositAmount×20/100 cho Farmer có lỗi dẫn đến hủy; ví dụ cọc 4.600.000 thì phạt mô phỏng 920.000. Làm tròn như §3 và chỉ ghi nghĩa vụ mô phỏng, không tự thu hoặc cấn thêm ngoài cọc 5%. • Ảnh hưởng: Payment

ID: D04 • Quyết định áp dụng: FORFEITED/REFUNDED biểu thị kết quả xử lý và chi trả mô phỏng hoàn tất trong cùng transaction quyết định; mỗi tracking tối đa một settlement. Không gọi release lần nữa. Settlement do Admin qua API riêng, có audit actor/decisionId, áp dụng cả account bị khóa. • Ảnh hưởng: Payment

ID: D05 • Quyết định áp dụng: Cọc đã RELEASED vẫn nhận hồ sơ khiếu nại muộn để Admin xem bằng chứng/uy tín; không đảo trạng thái cọc hoặc ghi chi trả lần hai. Nghĩa vụ bù lưu mô phỏng trong quyết định, không tự thu tiền. • Ảnh hưởng: Payment,User

ID: D06 • Quyết định áp dụng: User gửi email thông báo LOCKED/UNLOCKED cho email đã xác minh; Notification vẫn lưu lịch sử, REST vẫn chỉ ACTIVE. Email lỗi không rollback việc khóa; retry theo outbox, không gửi OTP qua Notification. • Ảnh hưởng: User,Notification

ID: D07 • Quyết định áp dụng: Admin được xác nhận hoàn tất thay khi Trader không thao tác nhưng có đủ bằng chứng và đã giải quyết tranh chấp; có reason/evidence/actor. Không dùng mốc+24h hoặc RELEASED làm bằng chứng hoàn tất. • Ảnh hưởng: Payment,Trading,User

Các mức khác giữ TXT: Farmer F01−1,F02−2,F03−2,F05−2,F06−3,F07−3,F08−5; Trader T01−1,T02−2,T03−2,T04−3,T05−3,T06−3,T07−5,T08−2. Chỉ áp dụng nghĩa vụ có trong Contract và lỗi đã xác nhận. Không phạt bất khả kháng được chấp nhận, lỗi ứng dụng/timeout, đồng thuận hủy/sửa, chưa có nghĩa vụ ACTIVE hoặc Trader không thắng Listing.

Thưởng+0,5 mỗi account/Contract hoàn tất không vi phạm sau 72 giờ từ completedAt và đã giải quyết hết tranh chấp; tối đa10 và1 điểm/cặp Farmer–Trader/30 ngày theo TXT. Không thưởng vì rút sau+24h, Admin mở khóa hoặc Contract hủy. Quyết định sai bị hủy hoàn đúng actual delta. Điểm0→User LOCKED và thu hồi refresh. Mở khóa chỉ khi score\>0 và không còn nguyên nhân khóa khác; không reset điểm1/10.

## **12.1. Quy trình đóng hồ sơ, thưởng và khiếu nại muộn**

Dispute: OPEN → UNDER\_REVIEW → RESOLVED. Payment lưu createdAt,responseDueAt,resolvedAt,outcome,decisionVersion; decision/evidence không sửa xóa lịch sử. Quá 48 giờ không tự kết luận có lỗi; Admin quyết định bằng bằng chứng, hoặc NO\_VIOLATION/INSUFFICIENT\_EVIDENCE để đóng hồ sơ và bỏ hold. Không dùng INSUFFICIENT\_EVIDENCE để phạt hoặc chi cọc ngay; việc rút sau đó vẫn phải đủ điều kiện thông thường. Chỉ đặt hold khi tracking còn LOCKED/RELEASABLE; sau RELEASED/FORFEITED/REFUNDED, nhận hồ sơ nhưng depositHold=false.

Decision depositDisposition được kiểm dưới khóa tracking: NO\_VIOLATION/INSUFFICIENT\_EVIDENCE → NONE, bỏ hold, không phạt; FARMER\_VIOLATION dẫn đến CANCELLED → REFUND\_TO\_TRADER; TRADER\_VIOLATION dẫn đến CANCELLED → FORFEIT\_TO\_FARMER; vi phạm đã khắc phục, Contract tiếp tục → NONE, chỉ phạt điểm theo mã. MUTUAL\_CANCEL chỉ khi có bằng chứng cả hai đồng ý → REFUND\_TO\_TRADER nếu còn cọc, không phạt. Với hồ sơ sau khi tiền đã chi, disposition bắt buộc NONE dù xác nhận vi phạm; không đổi COMPLETED về CANCELLED và không đảo terminal deposit. NONE không thay đổi trạng thái tiền đã chi. KEEP\_HELD chỉ là thao tác review, không phải kết quả RESOLVED. RELEASE\_TO\_FARMER chỉ trong thao tác hoàn tất/settlement đủ điều kiện, không tự gán vào kết luận thiếu bằng chứng.

Payment job xét thưởng từ completedAt+72h, mỗi Contract/account chỉ phát một COMPLETION\_REWARD; chỉ Contract không có vi phạm đã xác nhận và không còn hồ sơ mở. User dùng counterpartyId để kiểm tổng thưởng dương của account với cùng đối tác trong 30 ngày trượt ≤1 điểm, khóa row account trước tính và ghi; một Contract nhận tối đa \+0,5, điểm không quá 10\. Nếu không được thưởng vì cap thì ghi quyết định đã xử lý với actualDelta=0, không cộng lại về sau. Khi khiếu nại muộn xác nhận Contract có vi phạm, Payment phát REVERSAL cho các thưởng đã cấp của Contract, rồi PENALTY cho bên có lỗi; không thu hồi hai lần. Thu hồi thưởng sai không phải hình phạt thứ hai cho cùng hành vi.

Contract COMPLETED chỉ khi đã xác nhận hoàn tất; \+24h/RELEASED không thay thế completedAt. Mốc 72h để xét thưởng không gia hạn giữ cọc nếu điều kiện rút đã đủ. Khiếu nại muộn được tiếp nhận trong MVP, không tự đảo cọc đã chi. Payment API trả responseDueAt/status/decision để hai bên theo dõi; chưa thêm Kafka event Notification riêng cho từng bước dispute. Frontend tải lại hồ sơ khi mở trang và mỗi 30 giây khi trang đang hiển thị.

## **13\. Quyết định kỹ thuật v2.1 — API tranh chấp/Admin**

Các API sau là contract bắt buộc triển khai của Payment theo D01–D07. Không coi tài liệu là bằng chứng endpoint đã được code.

Method / endpoint: POST /api/v1/payments/contracts/{contractId}/disputes • Caller: Participant ACTIVE • DTO và kết quả: {reasonCode,description,evidenceRefs\[\]}→201 {disputeId,contractId,status:"OPEN",depositHold:true}; depositHold=false nếu cọc đã chi; mở trùng đang hoạt động→409

Method / endpoint: GET /api/v1/payments/disputes/{disputeId} • Caller: Participant ACTIVE hoặc ADMIN ACTIVE • DTO và kết quả: 200 hồ sơ theo quyền; không người ngoài

Method / endpoint: POST /api/v1/payments/disputes/{disputeId}/responses • Caller: Participant ACTIVE • DTO và kết quả: {statement,evidenceRefs\[\]}→201 response; evidence là tham chiếu tới cơ chế lưu được duyệt, không tự thêm media service

Method / endpoint: GET /api/v1/payments/admin/disputes • Caller: ADMIN ACTIVE • DTO và kết quả: cursor/limit/status filter, limit20/max100, createdAt DESC/disputeId DESC→200 {items,nextCursor}

Method / endpoint: POST /api/v1/payments/admin/disputes/{disputeId}/review • Caller: ADMIN ACTIVE • DTO và kết quả: {note}→200 UNDER\_REVIEW; lặp idempotent

Method / endpoint: POST /api/v1/payments/admin/disputes/{disputeId}/decisions • Caller: ADMIN ACTIVE • DTO và kết quả: {decisionId,expectedVersion,outcome,liableAccountId?,violationCode?,penaltyPoints?,depositDisposition,reason,evidenceRefs\[\]}→200 quyết định; Idempotency-Key=decisionId

Method / endpoint: POST /api/v1/payments/admin/decisions/{decisionId}/reversal • Caller: ADMIN ACTIVE • DTO và kết quả: {reversalDecisionId,reason,evidenceRefs\[\]}→200 liên kết gốc; không sửa lịch sử, không tự đảo cọc đã chi

Method / endpoint: POST /api/v1/payments/admin/contracts/{contractId}/complete • Caller: ADMIN ACTIVE, theo D07 • DTO và kết quả: {reason,evidenceRefs\[\],expectedVersion}→200 Contract COMPLETED nếu đủ điều kiện; audit actor

Outcome NO\_VIOLATION,FARMER\_VIOLATION,TRADER\_VIOLATION,MUTUAL\_CANCEL,INSUFFICIENT\_EVIDENCE. depositDisposition KEEP\_HELD,RELEASE\_TO\_FARMER,FORFEIT\_TO\_FARMER,REFUND\_TO\_TRADER,NONE. Không phải mọi tổ hợp outcome/disposition đều hợp lệ: chỉ theo quyết định có bằng chứng và state của tracking; thiếu bằng chứng thì không penalty/settlement. Việc hủy đồng thuận và hoàn cọc cần điều khoản/decision rõ ràng, không suy ngầm.

Admin không liên quan vẫn không có quyền đọc mọi tin Chat. API dispute chỉ cho đọc bằng chứng đã nộp trong hồ sơ. Admin không xử lý hồ sơ của chính mình hoặc có xung đột lợi ích; xử lý/xem xét lại bởi Admin độc lập theo §19. Evidence có kiểm quyền riêng theo §18.

## **14\. Notification và client đã chốt**

4 API: GET /api/v1/notifications; GET /api/v1/notifications/{notificationId}; PATCH /api/v1/notifications/{notificationId}/read; GET /api/v1/notifications/unread-count. Own account kể cả ADMIN; resource người khác404. Không read-all trong MVP. page0/size20/max100, isRead/type, sort createdAt DESC/notificationId DESC; cutoff90ngày áp dụng list/detail/count/read, không chờ cleanup. Mark-read lặp giữ readAt.

7 template giao thương Contract v1 giữ nguyên. Bổ sung 3 template: REPUTATION\_CHANGED title “Điểm uy tín đã thay đổi”, content “Điểm uy tín của bạn thay đổi từ {beforeScore} thành {afterScore}. Lý do: {reasonCode}.”; ACCOUNT\_LOCKED title “Tài khoản đã bị khóa”, content “Tài khoản của bạn đã bị khóa. Vui lòng kiểm tra email để biết cách liên hệ hỗ trợ.”; ACCOUNT\_UNLOCKED title “Tài khoản đã được mở khóa”, content “Tài khoản của bạn đã được mở khóa. Bạn có thể đăng nhập lại.” Không lộ bằng chứng/contacts hoặc dữ liệu bên kia. Client điều hướng ACCOUNT về hồ sơ cá nhân; link không cấp quyền. Migration type/referenceType và consumer phải hỗ trợ đủ 10 loại Notification trước tích hợp; không giữ CHECK chỉ 7 loại cũ.

Chat TEXT≤2000 ký tự,IMAGE≤5 MiB; media validator có trách nhiệm kiểm byte thực, không tin kích thước client khai. Upload/read ảnh thuộc service owner theo §18, không thêm media service độc lập.

## **15\. Gateway, port và cấu hình**

Route / port: Gateway8080 • Destination: Client entry; JWT/access-state

Route / port: /api/v1/auth/,/users/,/farmers/,/traders/,/admin/accounts/ dưới prefix /api/v1 • Destination: User8081

Route / port: /api/v1/plots/,/crop-seasons/,/logs/,/costs/ dưới prefix /api/v1 • Destination: Farming8082

Route / port: /api/v1/listings/,/api/v1/offers/ • Destination: Trading8083

Route / port: /api/v1/conversations/ và WebSocket Chat hiện có • Destination: Chat8084

Route / port: /api/v1/payments/ • Destination: Payment8085, gồm Contract/Deposit; dispute/admin và evidence theo §13/§18

Route / port: /api/v1/notifications/ • Destination: Notification8086, REST

Route / port: /internal/ • Destination: Không public; private service auth

Không rewrite/bỏ prefix /api/v1 nếu chưa có contract riêng. CORS/local origin, token storage và cấu hình deployment theo §17/§19. Keys/DB/SMTP/service secrets lấy từ env, không commit Git. Không có CONTRACT\_SERVICE\_URL riêng.

Route đặc biệt: Gateway từ chối public GET /api/v1/plots/{plotId}/summary trước route /api/v1/plots/; Trading gọi trực tiếp Farming bằng service key. GET Contract của participant trả thêm disputeSummary:{disputeId,status,responseDueAt,depositHold}\|null để hai bên mở đúng hồ sơ; client không phải đoán disputeId. Review lần đầu gán assignedAdminId=actorId; idempotent review không ghi đè responseDueAt. Cùng endpoint review cho phép Admin độc lập nhận lại hồ sơ với note bắt buộc, kiểm expectedVersion để tránh ghi đè người đang xử lý và audit người trước/sau; không reset thời hạn. Không có endpoint handover riêng.

## **16\. Kiểm thử chấp nhận trước tích hợp**

## **1\. Register ADMIN bị từ chối; seed Admin UNVERIFIED phải OTP; JWT RS256/iss/aud đúng; User state down→503.**

2\. Lock account bằng Admin hoặc score0: token cũ bị chặn sau commit ở Gateway/backend/WebSocket; refresh bị thu hồi; unlock không reset score hoặc bỏ nguyên nhân khóa khác.

## **3\. POST Offer không mở Chat; accept nhiều Offer mở đúng một phòng/offerId; replay không trùng.**

4\. Hai Trader nạp cùng Listing: chỉ một winner; timeout giữa hai DB và retry vẫn một chốt/cọc/event; không báo thành công khi chưa xác định kết quả.

5\. Snapshot thiếu cropType/GPS hoặc sai season/owner không tạo Listing; replica không có OTP/token/contact và event muộn không hiện lại profile đã ẩn.

## **6\. Tranh chấp/job24h/release đua nhau: có hồ sơ giữ cọc hợp lệ thì không chi; RELEASED không đảo về LOCKED hoặc chi hai lần.**

7\. Reputation retry cùng/khác eventId nhưng cùng decision business key chỉ áp một lần; reward một lần/Contract/account; reversal trả actual delta, không vượt10.

8\. Notification mọi recipients trong cùng transaction; crash trước offset không trùng; xóa nội dung90ngày rồi replay không tạo lại nhờ receipt; PAID không có thông báo DepositLOCKED thứhai.

9\. EventContract stateVersion cũ không rollback card/Listing; schema/source/version sai→DLT; retry5/30/120 và publish-forward lỗi không mất event.

10\. Admin dispute API không bỏ ownership khỏi participant API, không cho đọc tùy ý Chat; audit có actor/target/decision/time.

## **17\. Frontend, token và CORS**

Giữ repository/frontend framework hiện có; contract trình duyệt không buộc đổi framework. Frontend dev chuẩn http\://localhost:5173, Gateway http\://localhost:8080. Nếu port repo khác, cấu hình lại dev server về 5173 để nhóm dùng chung; đây là cấu hình chọn cho triển khai, không khẳng định repo hiện tại đã dùng port đó. Deployment dùng cùng HTTPS origin cho frontend và Gateway /api; domain thật lấy từ PUBLIC\_APP\_ORIGIN, không ghi domain giả vào source.

Login/refresh vẫn TokenPair JSON; refresh/logout body {refreshToken}. Access và refresh token chỉ ở bộ nhớ của phiên trang, không localStorage/sessionStorage/IndexedDB/cookie/URL. Reload/đóng tab mất token và cần đăng nhập lại; MVP không có remember-me. Hạn refresh 7 ngày vẫn là giới hạn server, không phải cam kết phiên trình duyệt tồn tại 7 ngày. Một refresh request tại một thời điểm, các request chờ dùng TokenPair mới; 401 chỉ thử refresh một lần, refresh lỗi thì xóa bộ nhớ và về login. 403 ACCOUNT\_NOT\_ACTIVE không retry refresh để vượt khóa. Logout gọi API khi access còn hợp lệ, xóa bộ nhớ trong finally; nếu access hết hạn nhưng refresh còn hợp lệ thì refresh trước logout. Token bị bỏ trên browser không tự được coi là đã revoke trên server.

Fetch dùng Authorization: Bearer, credentials:omit; không gửi token trong query/WebSocket URL. WebSocket xác thực ở message CONNECT theo giao thức Chat, trước mọi SUBSCRIBE/SEND và khi token hết hạn; reconnect với token mới. CORS Gateway allowlist đúng http\://localhost:5173 ở dev; deploy cùng origin; allowCredentials=false, không wildcard; cho Authorization,Content-Type,Idempotency-Key,X-Request-Id và GET/POST/PUT/PATCH/DELETE/OPTIONS. OPTIONS chỉ xử lý preflight, không bỏ auth request nghiệp vụ. Backend không mở CORS public riêng; internal không qua Gateway.

## **18\. Upload và đọc ảnh theo owner**

MVP lưu file trên persistent volume riêng của User/Chat/Payment, ngoài webroot; database owner lưu metadata. Không mount volume của service khác, không đọc DB chéo; một instance ghi file mỗi owner trong bản demo. Backup DB và volume cùng nhau; container restart không mất ảnh. Khi cần nhiều replica, thay storage adapter bằng object storage sau MVP, không đổi DTO public.

Chỉ JPEG/PNG/WebP; tối đa 5 MiB (5.242.880 byte) mỗi ảnh, 20 megapixel sau decode; kiểm chữ ký/decoder và re-encode, không tin MIME/extension. Không SVG/HTML/PDF/ZIP trong upload MVP; tài liệu tranh chấp dùng mô tả văn bản hoặc ảnh chụp. UUID tên lưu trữ, không dùng filename/path client. 400 file hỏng/field sai; 413 quá dung lượng; 415 định dạng không hỗ trợ. Không fetch URL client gửi; không trả đường dẫn ổ đĩa. Download qua Gateway có Bearer, Cache-Control:private,no-store và X-Content-Type-Options:nosniff; frontend fetch blob rồi hiển thị, không đặt token trong img URL.

API: POST /api/v1/users/me/avatar • Quyền / request: Account ACTIVE; multipart file • Response: 201 {mediaId,avatarUrl,contentType,sizeBytes}; cập nhật avatar profile cùng metadata và public-profile outbox, ADMIN chỉ avatar của mình

API: GET /api/v1/users/media/{mediaId} • Quyền / request: ACTIVE, owner hoặc quyền xem public profile ACTIVE theo whitelist • Response: 200 bytes; không được xem/không tồn tại 404

API: POST /api/v1/conversations/{conversationId}/media • Quyền / request: Participant ACTIVE; multipart file • Response: 201 {mediaId,attachmentUrl,contentType,sizeBytes}; upload chưa tạo Message

API: GET /api/v1/conversations/{conversationId}/media/{mediaId} • Quyền / request: Participant ACTIVE; cùng conversation; file đã gắn message hoặc chính uploader của file tạm • Response: 200 bytes; người ngoài 404; ADMIN không có quyền đọc Chat mặc định

API: POST /api/v1/payments/disputes/{disputeId}/evidence • Quyền / request: Participant ACTIVE hoặc Admin độc lập đang xử lý; multipart file, description tùy chọn • Response: 201 {evidenceId,downloadUrl,contentType,sizeBytes}; evidence thuộc đúng dispute và uploader, bất biến

API: GET /api/v1/payments/disputes/{disputeId}/evidence/{evidenceId} • Quyền / request: Participant ACTIVE hoặc Admin độc lập có quyền hồ sơ • Response: 200 bytes; người ngoài 404

User/Chat có media\_assets (Chat là collection) gồm media\_id,owner\_account\_id,resource\_id,storage\_key,content\_type,size\_bytes,sha256,created\_at,attached\_at; Payment dùng dispute\_evidence với các field tương ứng, không tạo media DB chung. File tạm chưa attach quá 24h được cleanup; không xóa ảnh đã gắn Message/bằng chứng cùng cleanup Notification 90 ngày. Ghi file hoàn chỉnh trước commit metadata; lỗi DB để orphan được cleanup sau 24h, không trả URL thành công khi file chưa bền vững.

Chat giữ send DTO IMAGE {messageType:"IMAGE",attachmentUrl}; attachmentUrl bắt buộc do endpoint upload Chat trả về, thuộc conversation và uploader, chưa gắn message khác. Service resolve URL về mediaId, kiểm metadata/ownership và attach cùng transaction Message/outbox. Không chấp nhận URL ngoài hoặc của participant khác. Mỗi ảnh dùng một message; lần gửi mới cần upload mới. User profile PATCH avatarUrl chỉ được dùng URL thuộc upload owner tương ứng; không cho Admin trỏ avatar của account khác vào file riêng của mình. Avatar upload đã cập nhật profile nên client không cần PATCH lại. Payment evidenceRefs là mảng evidenceId thuộc đúng hồ sơ; tạo dispute có thể gửi evidenceRefs=\[\] rồi upload, Admin chỉ kết luận vi phạm khi đủ bằng chứng.

Flow upload: Client Bearer → Gateway kiểm JWT/state → owner kiểm quyền resource và decode ảnh → volume owner \+ metadata DB owner → trả URL API có kiểm quyền → Client gửi message hoặc mở hồ sơ. File private không được phát trong Kafka payload; chỉ reference ID nghiệp vụ theo event contract.

## **19\. Vận hành Admin và baseline tích hợp**

Seed tối thiểu hai account ADMIN riêng với email thật cấu hình qua secret/env, từng người OTP trước ACTIVE; không dùng chung password/tài khoản, không thêm API create ADMIN. ADMIN không có role FARMER/TRADER trong cùng account. Admin phải từ chối xử lý khi có lợi ích liên quan hoặc đại diện một bên; API chặn actorId trùng farmerId/traderId, kiểm assignedAdminId và log actor/target/decision/reason/time. Quyết định đảo phải do Admin khác originalActorId. Không đủ Admin độc lập ACTIVE thì giữ hồ sơ/hold và báo 409 ADMIN\_REVIEW\_UNAVAILABLE, không tự bỏ kiểm tra quyền.

Account LOCKED không được vượt access-state để gọi API participant. Người bị khóa liên hệ địa chỉ SUPPORT\_EMAIL ghi trong email khóa để nộp thông tin; đây là quy trình hỗ trợ thủ công, không tự xây hệ thống email ticket. Admin xác minh danh tính qua email đã đăng ký, ghi nguồn và bằng chứng vào hồ sơ; có thể POST /api/v1/payments/admin/contracts/{contractId}/disputes với {onBehalfOfAccountId,reasonCode,description,verificationNote}, trả 201 DTO dispute như API participant. onBehalfOfAccountId phải là một participant của Contract; Admin không giả JWT người dùng. Admin upload evidence qua §18, ghi rõ nguồn là participant nào. Log bảo mật không chứa OTP/token/toàn bộ file. cấu hình SUPPORT\_EMAIL trước demo.

Git tối thiểu cho các repo: main có thể chạy; feat/\<short-name\>,fix/\<short-name\>; PR có một người khác review; không force-push main, không commit secret; giữ lịch sử và convention chi tiết đã có nếu không mâu thuẫn. Mỗi service có .env.example chỉ tên biến và giá trị mẫu không nhạy cảm. Giữ stack backend hiện có. PostgreSQL database/user riêng từng owner; Chat Mongo replica set; Kafka chung cho producer/consumer có trong §8–9. Farming không cần Kafka producer trong MVP.

Farming env: SERVER\_PORT=8082,DATABASE\_URL,USER\_SERVICE\_URL,JWT\_PUBLIC\_KEY\_PATH,JWT\_ISSUER=urn:soa:user-service,JWT\_AUDIENCE=soa-api,ACCESS\_STATE\_TIMEOUT\_MS=1000 và service key riêng cho từng caller trong secret. Compose định nghĩa farming-db và volume dữ liệu riêng; trong container dùng DNS service, không localhost cho dependency. Các service dùng port §15. User thêm SMTP\_\*,SUPPORT\_EMAIL,JWT\_PRIVATE\_KEY\_PATH,JWT\_KEY\_ID; các owner media thêm MEDIA\_STORAGE\_DIR/MAX\_UPLOAD\_BYTES; không dùng một service key chung toàn hệ thống.

User chuẩn hóa username/email trim \+ lowercase trước unique lookup, không thay dữ liệu lịch sử bị trùng bằng merge tự động. OTP cleanup hằng ngày xóa bản ghi đã dùng/hết hạn, không làm reset quota 5 mã/giờ/email; quota dùng timestamp phát hành tách khỏi cleanup. Login giới hạn 10 lần sai/15 phút theo cặp IP+username, vượt trả 429 với Retry-After; OTP vẫn giữ giới hạn đã chốt. Giới hạn IP không thay khóa reputation/Admin. JWT kid xác định khóa; rotate có giai đoạn overlap public key tối thiểu 16 phút (15 phút access \+ 60 giây clock skew), chỉ User giữ private; cấu hình public key set qua deployment, không tự thêm JWKS API. Clock skew tối đa 60 giây không nới access-state timeout 1 giây.

Trước demo phải điền domain/SMTP/email Admin/SUPPORT\_EMAIL/service keys và kiểm migration/backfill bằng dữ liệu thật. Đây là cấu hình triển khai cần người giữ tài khoản cung cấp, không còn là quyết định nghiệp vụ chờ duyệt. Không cam kết hệ thống đã code/test chỉ từ việc hoàn thiện BA.

Tham chiếu triển khai bảo mật: OWASP HTML5 Security Cheat Sheet (https\://cheatsheetseries.owasp.org/cheatsheets/HTML5\_Security\_Cheat\_Sheet.html) về không lưu session identifier trong localStorage; OWASP File Upload Cheat Sheet (https\://cheatsheetseries.owasp.org/cheatsheets/File\_Upload\_Cheat\_Sheet.html) về allowlist file, giới hạn và lưu ngoài webroot. Các lựa chọn thời hạn/phạt/stack ở tài liệu là quyết định thiết kế của dự án, không phải khuyến nghị nghiệp vụ từ OWASP.

## **Change Log của Contract v2.1**

\- Hiệu lực, §6–10, §12–13: chuyển đề xuất thành baseline v2.1 theo chỉ đạo chọn phương án và thực hiện của người dùng. Nguồn: quyết định mới nhất \+ Contract v2.

\- D01–D07: chốt 48h/72h, F04 −2/−3, phạt mô phỏng 20% cho Contract mới, settlement một lần, khiếu nại muộn, email khóa/mở, Admin complete có bằng chứng. Nguồn: TXT \+ quyết định áp dụng Contract v2.1.

\- §7.1, §17–19: PATCH/visibility/backfill Farming; token bộ nhớ/CORS; media theo owner; Admin độc lập và cấu hình tích hợp. Nguồn: Contract v2.1 theo quyền người dùng giao lựa chọn.

\- §9–12: thêm counterpartyId để thực thi cap thưởng; reversal chống đảo trùng và thu hồi thưởng sai; đóng hồ sơ có outcome rõ ràng. Nguồn: TXT \+ Contract v2.1.

## **Tình trạng quyết định của Contract v2.1**

Không còn quyết định nghiệp vụ D01–D07 hoặc gói kỹ thuật v2 chờ duyệt trong phạm vi đã giao. Việc cung cấp domain/SMTP/seed email/secret, kiểm kê dữ liệu backfill và xác minh code hiện tại là công việc triển khai theo §19, không dùng dữ liệu giả để coi đã hoàn tất. Nghiệp vụ mới ngoài baseline phải được xử lý thành thay đổi phạm vi riêng.

# **Change Log**

§1–3, §19, §21 và sơ đồ kiến trúc: 6 service main, Chat MVP, bổ sung Payment và REST Notification/Chat; Contract deployment có nhãn xác nhận. Nguồn: Conflict 01, 03–04, 08, 15; Contract 2, 12\.

§4–9, §11–14: ownership/UUID, 5 bảng User nền và history/outbox/media bổ sung, role/status/OTP/Admin, public profile, Kafka/envelope/10 Notification event và lock tức thời đồng bộ giữa các service. Nguồn: Conflict 02, 05–07, 10–15; Contract 2–11.

§6–7, §12, §18 và ví dụ: loại fields public phone/buyingArea, endpoint Negotiation/Farming không được dùng để tự chốt; cấu hình JWT/Kafka theo nguồn ưu tiên. Nguồn: Conflict 09, 12–13; Contract 1, 4, 6, 12–13.

Cập nhật baseline v2.1: đóng D01–D07, chuẩn hóa API/event/schema/flow và các mục token/CORS/media/Admin theo phạm vi service. Nguồn: Conflict \+ Contract v2.1 theo chỉ đạo người dùng chọn phương án và thực hiện; nội dung tài liệu không chứng minh code đã triển khai.

# **Open Issues**

Không còn quyết định nghiệp vụ/gói kỹ thuật chờ duyệt trong baseline v2.1. Cấu hình thật (domain, SMTP, seed email, SUPPORT\_EMAIL, secrets), backfill dữ liệu và kiểm thử mã nguồn là việc triển khai theo Contract §19; không ghi chúng là đã hoàn tất. Mở vấn đề mới chỉ khi có thay đổi phạm vi hoặc mâu thuẫn mới được phát hiện.

[image1]: <data:image/png;base64,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>

[image2]: <data:image/png;base64,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>