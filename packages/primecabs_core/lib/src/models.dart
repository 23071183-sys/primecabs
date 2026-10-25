// Shapes returned by the PrimeCabs API (docs/api.md). Money is integer paise; times are UTC.

typedef Json = Map<String, dynamic>;

T? _opt<T>(Object? v, T Function(Json) f) => v == null ? null : f(v as Json);
List<T> _list<T>(Object? v, T Function(Json) f) => (v as List? ?? const []).map((e) => f(e as Json)).toList();
DateTime? _date(Object? v) => v == null ? null : DateTime.parse(v as String);

enum DriverStatus { draft, pending, approved, rejected, suspended }

enum ReviewStatus { pending, approved, rejected }

enum RideStatus { pendingApproval, rejected, open, full, started, completed, cancelled }

enum PassengerStatus { booked, onboard, dropped, noShow }

T _enum<T extends Enum>(List<T> values, String raw) {
  final key = raw.toLowerCase().replaceAll('_', '');
  return values.firstWhere((e) => e.name.toLowerCase() == key);
}

class Vehicle {
  Vehicle.fromJson(Json j)
      : id = j['id'] as String,
        typeId = (j['type'] as Json)['id'] as String,
        typeName = (j['type'] as Json)['name'] as String,
        passengerSeats = (j['type'] as Json)['passengerSeats'] as int,
        registrationNo = j['registrationNo'] as String,
        make = j['make'] as String,
        model = j['model'] as String,
        year = j['year'] as int,
        colour = j['colour'] as String,
        yellowPlate = j['plateType'] == 'YELLOW',
        status = _enum(ReviewStatus.values, j['status'] as String),
        rejectionReason = j['rejectionReason'] as String?;

  final String id, typeId, typeName, registrationNo, make, model, colour;
  final int passengerSeats, year;
  final bool yellowPlate;
  final ReviewStatus status;
  final String? rejectionReason;
}

class ChecklistItem {
  ChecklistItem.fromJson(Json j)
      : documentTypeId = j['documentTypeId'] as String,
        code = j['code'] as String,
        label = j['label'] as String,
        vehicleId = j['vehicleId'] as String?,
        required = j['required'] as bool,
        hasExpiry = j['hasExpiry'] as bool? ?? false,
        documentId = j['documentId'] as String?,
        status = j['status'] == null ? null : _enum(ReviewStatus.values, j['status'] as String),
        rejectReason = j['rejectReason'] as String?;

  final String documentTypeId, code, label;
  final String? vehicleId, documentId, rejectReason;
  final bool required, hasExpiry;
  final ReviewStatus? status;
}

class DriverMe {
  DriverMe.fromJson(Json j)
      : id = j['id'] as String,
        status = _enum(DriverStatus.values, j['status'] as String),
        rejectionReason = j['rejectionReason'] as String?,
        name = j['name'] as String?,
        phone = j['phone'] as String,
        email = j['email'] as String?,
        age = j['age'] as int?,
        gender = j['gender'] as String?,
        homeCityId = (j['homeCity'] as Json?)?['id'] as String?,
        homeCityName = (j['homeCity'] as Json?)?['name'] as String?,
        bankAccountName = (j['bank'] as Json)['accountName'] as String?,
        bankLast4 = (j['bank'] as Json)['accountNoLast4'] as String?,
        bankIfsc = (j['bank'] as Json)['ifsc'] as String?,
        upiId = (j['bank'] as Json)['upiId'] as String?,
        vehicles = _list(j['vehicles'], Vehicle.fromJson),
        documents = _list((j['documents'] as Json)['items'], ChecklistItem.fromJson),
        missingDocuments = _list((j['documents'] as Json)['missing'], ChecklistItem.fromJson);

  final String id, phone;
  final DriverStatus status;
  final String? rejectionReason, name, email, gender, homeCityId, homeCityName, bankAccountName, bankLast4, bankIfsc, upiId;
  final int? age;
  final List<Vehicle> vehicles;
  final List<ChecklistItem> documents, missingDocuments;

  List<Vehicle> get approvedVehicles => vehicles.where((v) => v.status == ReviewStatus.approved).toList();
  bool get hasPayout => bankLast4 != null || upiId != null;
}

class PickupPoint {
  PickupPoint.fromJson(Json j)
      : id = j['id'] as String,
        name = j['name'] as String,
        kind = j['kind'] as String,
        extraFare = j['extraFare'] as int;
  final String id, name, kind;
  final int extraFare;
}

class City {
  City.fromJson(Json j)
      : id = j['id'] as String,
        name = j['name'] as String,
        state = j['state'] as String? ?? '', // not sent with a ride's cities
        isHub = j['type'] == 'HUB',
        homePickupAllowed = j['homePickupAllowed'] as bool? ?? false,
        homePickupFee = j['homePickupFee'] as int? ?? 0,
        pickupPoints = _list(j['pickupPoints'], PickupPoint.fromJson);
  final String id, name, state;
  final bool isHub, homePickupAllowed;
  final int homePickupFee;
  final List<PickupPoint> pickupPoints;
}

class RouteRef {
  RouteRef.fromJson(Json j)
      : id = j['id'] as String,
        fromCityId = j['fromCityId'] as String,
        toCityId = j['toCityId'] as String,
        distanceKm = j['distanceKm'] as int,
        durationMinutes = j['durationMinutes'] as int;
  final String id, fromCityId, toCityId;
  final int distanceKm, durationMinutes;
}

class VehicleType {
  VehicleType.fromJson(Json j)
      : id = j['id'] as String,
        code = j['code'] as String,
        name = j['name'] as String,
        passengerSeats = j['passengerSeats'] as int;
  final String id, code, name;
  final int passengerSeats;
}

class FareDecision {
  FareDecision.fromJson(Json j)
      : decision = j['decision'] as String,
        reason = j['reason'] as String?,
        approvedFare = j['approvedFare'] as int?;
  final String decision;
  final String? reason;
  final int? approvedFare;
}

class DriverRide {
  DriverRide.fromJson(Json j)
      : id = j['id'] as String,
        routeId = j['routeId'] as String,
        from = j['from'] as String,
        to = j['to'] as String,
        departureAt = DateTime.parse(j['departureAt'] as String),
        arrivalAt = DateTime.parse(j['arrivalAt'] as String),
        status = _enum(RideStatus.values, j['status'] as String),
        cancelReason = j['cancelReason'] as String?,
        vehicleId = (j['vehicle'] as Json)['id'] as String,
        vehicleType = (j['vehicle'] as Json)['type'] as String,
        registrationNo = (j['vehicle'] as Json)['registrationNo'] as String,
        totalSeats = j['totalSeats'] as int,
        availableSeats = j['availableSeats'] as int,
        seatsSold = j['seatsSold'] as int,
        proposedSeatFare = j['proposedSeatFare'] as int,
        seatFare = j['seatFare'] as int?,
        fareDecision = _opt(j['fareDecision'], FareDecision.fromJson),
        earnings = j['earnings'] as int;

  final String id, routeId, from, to, vehicleId, vehicleType, registrationNo;
  final DateTime departureAt, arrivalAt;
  final RideStatus status;
  final String? cancelReason;
  final int totalSeats, availableSeats, seatsSold, proposedSeatFare, earnings;
  final int? seatFare;
  final FareDecision? fareDecision;
}

class Passenger {
  Passenger.fromJson(Json j)
      : id = j['id'] as String,
        bookingCode = j['bookingCode'] as String,
        name = j['name'] as String,
        phone = j['phone'] as String,
        age = j['age'] as int,
        gender = j['gender'] as String,
        status = _enum(PassengerStatus.values, j['status'] as String),
        pickup = j['pickup'] as String?,
        drop = j['drop'] as String?;
  final String id, bookingCode, name, phone, gender;
  final int age;
  final PassengerStatus status;
  final String? pickup, drop;
}

class RideDetail {
  RideDetail.fromJson(Json j)
      : id = j['id'] as String,
        routeId = j['routeId'] as String,
        vehicleId = j['vehicleId'] as String,
        notes = j['notes'] as String?,
        cancelReason = j['cancelReason'] as String?,
        fareDecision = _opt(j['fareDecision'], FareDecision.fromJson),
        from = j['from'] as String,
        to = j['to'] as String,
        departureAt = DateTime.parse(j['departureAt'] as String),
        arrivalAt = DateTime.parse(j['arrivalAt'] as String),
        status = _enum(RideStatus.values, j['status'] as String),
        seatFare = j['seatFare'] as int?,
        proposedSeatFare = j['proposedSeatFare'] as int,
        totalSeats = j['totalSeats'] as int,
        availableSeats = j['availableSeats'] as int,
        vehicleType = (j['vehicle'] as Json)['type'] as String,
        registrationNo = (j['vehicle'] as Json)['registrationNo'] as String,
        earnings = j['earnings'] as int,
        passengers = _list(j['passengers'], Passenger.fromJson);

  final String id, routeId, vehicleId, from, to, vehicleType, registrationNo;
  final String? notes, cancelReason;
  final FareDecision? fareDecision;
  final DateTime departureAt, arrivalAt;
  final RideStatus status;
  final int? seatFare;
  final int proposedSeatFare, totalSeats, availableSeats, earnings;
  final List<Passenger> passengers;

  int get seatsBooked => totalSeats - availableSeats;
}

class Earnings {
  Earnings.fromJson(Json j)
      : last7Days = j['last7Days'] as int,
        last30Days = j['last30Days'] as int,
        upcoming = j['upcoming'] as int,
        seatsSoldLast7Days = j['seatsSoldLast7Days'] as int;
  final int last7Days, last30Days, upcoming, seatsSoldLast7Days;
}

class PerSeatEstimate {
  PerSeatEstimate.fromJson(Json j)
      : customerPays = j['customerPays'] as int,
        gst = j['gst'] as int,
        commission = j['commission'] as int,
        commissionPercent = (j['commissionPercent'] as num).toDouble(),
        driverEarns = j['driverEarns'] as int;
  final int customerPays, gst, commission, driverEarns;
  final double commissionPercent;
}

class ReferenceFare {
  ReferenceFare.fromJson(Json j)
      : referenceSeatFare = j['referenceSeatFare'] as int?,
        passengerSeats = j['passengerSeats'] as int,
        perSeat = _opt(j['perSeat'], PerSeatEstimate.fromJson);
  final int? referenceSeatFare;
  final int passengerSeats;
  final PerSeatEstimate? perSeat;
}

class PublicConfig {
  PublicConfig.fromJson(Json j)
      : bookingHorizonDays = j['bookingHorizonDays'] as int,
        bookingCutoffMinutes = j['bookingCutoffMinutes'] as int,
        seatHoldMinutes = j['seatHoldMinutes'] as int,
        supportPhone = (j['support'] as Json)['phone'] as String,
        supportEmail = (j['support'] as Json)['email'] as String,
        gstIncluded = (j['gst'] as Json?)?['mode'] != 'ADDED',
        gstRatePercent = ((j['gst'] as Json?)?['ratePercent'] as num?) ?? 5,
        refundPolicy = _list(j['refundPolicy'], RefundTier.fromJson);
  final int bookingHorizonDays, bookingCutoffMinutes, seatHoldMinutes;
  final String supportPhone, supportEmail;
  final bool gstIncluded;
  final num gstRatePercent;

  /// Highest tier first, e.g. "24+ hours before: 100%".
  final List<RefundTier> refundPolicy;
}

class RefundTier {
  RefundTier.fromJson(Json j)
      : minHoursBefore = (j['minHoursBefore'] as num).toInt(),
        percent = (j['percent'] as num).toInt(),
        label = j['label'] as String;
  final int minHoursBefore, percent;
  final String label;
}

/// Returned when a ride is created; the app offers to publish the return trip with these values.
class ReturnSuggestion {
  ReturnSuggestion.fromJson(Json j)
      : routeId = j['routeId'] as String,
        vehicleId = j['vehicleId'] as String,
        earliestDepartureAt = DateTime.parse(j['earliestDepartureAt'] as String),
        totalSeats = j['totalSeats'] as int,
        seatFare = j['seatFare'] as int;
  final String routeId, vehicleId;
  final DateTime earliestDepartureAt;
  final int totalSeats, seatFare;
}

DateTime? parseDate(Object? v) => _date(v);

// ---------- Customer app ----------

enum BookingStatus { held, confirmed, completed, cancelled, expired }

class CustomerMe {
  CustomerMe.fromJson(Json j)
      : id = j['id'] as String,
        phone = j['phone'] as String,
        name = j['name'] as String?,
        email = j['email'] as String?,
        age = j['age'] as int?,
        gender = j['gender'] as String?,
        profileComplete = j['profileComplete'] as bool? ?? false;
  final String id, phone;
  final String? name, email, gender;
  final int? age;
  final bool profileComplete;
}

/// One ride in search results.
class RideOption {
  RideOption.fromJson(Json j)
      : id = j['id'] as String,
        departureAt = DateTime.parse(j['departureAt'] as String),
        arrivalAt = DateTime.parse(j['arrivalAt'] as String),
        durationMinutes = j['durationMinutes'] as int,
        seatFare = j['seatFare'] as int,
        availableSeats = j['availableSeats'] as int,
        totalSeats = j['totalSeats'] as int,
        vehicleType = j['vehicleType'] as String,
        driverFirstName = j['driverFirstName'] as String,
        available = j['available'] as bool,
        unavailableReason = j['unavailableReason'] as String?;
  final String id, vehicleType, driverFirstName;
  final DateTime departureAt, arrivalAt;
  final int durationMinutes, seatFare, availableSeats, totalSeats;
  final bool available;

  /// FULL, NOT_ENOUGH_SEATS or BOOKING_NOT_OPEN when [available] is false.
  final String? unavailableReason;
}

class SearchResult {
  SearchResult.fromJson(Json j)
      : routeExists = j['routeId'] != null,
        distanceKm = j['distanceKm'] as int?,
        items = _list(j['items'], RideOption.fromJson);
  final bool routeExists;
  final int? distanceKm;
  final List<RideOption> items;
}

/// A ride opened for booking, with the pickup and drop choices of both cities.
class BookableRide {
  BookableRide.fromJson(Json j)
      : id = j['id'] as String,
        departureAt = DateTime.parse(j['departureAt'] as String),
        arrivalAt = DateTime.parse(j['arrivalAt'] as String),
        seatFare = j['seatFare'] as int,
        availableSeats = j['availableSeats'] as int,
        totalSeats = j['totalSeats'] as int,
        vehicleType = j['vehicleType'] as String,
        driverFirstName = j['driverFirstName'] as String,
        from = City.fromJson(j['from'] as Json),
        to = City.fromJson(j['to'] as Json);
  final String id, vehicleType, driverFirstName;
  final DateTime departureAt, arrivalAt;
  final int seatFare, availableSeats, totalSeats;
  final City from, to;
}

/// Customer-facing price. GST is inside [total] when [gstIncluded].
class Fare {
  Fare.fromJson(Json j)
      : seatFare = j['seatFare'] as int,
        seats = j['seats'] as int,
        seatsAmount = j['seatsAmount'] as int,
        pickupExtra = j['pickupExtra'] as int,
        dropExtra = j['dropExtra'] as int,
        gstIncluded = j['gstMode'] != 'ADDED',
        gstRatePercent = j['gstRatePercent'] as num,
        gstAmount = j['gstAmount'] as int,
        total = j['total'] as int;
  final int seatFare, seats, seatsAmount, pickupExtra, dropExtra, gstAmount, total;
  final bool gstIncluded;
  final num gstRatePercent;
}

/// A booking just created: seats are held until [holdExpiresAt].
class BookingHold {
  BookingHold.fromJson(Json j)
      : id = j['id'] as String,
        code = j['code'] as String,
        holdExpiresAt = DateTime.parse(j['holdExpiresAt'] as String),
        fare = Fare.fromJson(j['fare'] as Json);
  final String id, code;
  final DateTime holdExpiresAt;
  final Fare fare;
}

/// What the payment gateway needs. With provider FAKE the app uses the test checkout.
class PaymentOrder {
  PaymentOrder.fromJson(Json j)
      : provider = j['provider'] as String,
        keyId = j['keyId'] as String?,
        orderId = j['orderId'] as String,
        amount = j['amount'] as int,
        bookingCode = j['bookingCode'] as String,
        holdExpiresAt = DateTime.parse(j['holdExpiresAt'] as String);
  final String provider, orderId, bookingCode;
  final String? keyId;
  final int amount;
  final DateTime holdExpiresAt;
  bool get isTest => provider == 'FAKE';
}

class TicketPassenger {
  TicketPassenger.fromJson(Json j)
      : id = j['id'] as String,
        name = j['name'] as String,
        age = j['age'] as int,
        gender = j['gender'] as String,
        status = _enum(PassengerStatus.values, j['status'] as String),
        startCode = j['startCode'] as String?,
        endCode = j['endCode'] as String?;
  final String id, name, gender;
  final int age;
  final PassengerStatus status;
  final String? startCode, endCode;
}

class Stop {
  Stop.fromJson(Json j)
      : point = j['point'] as String?,
        address = j['address'] as String?;
  final String? point, address;
  String get label => point ?? address ?? '—';
  bool get isHome => point == null && address != null;
}

/// The e-ticket.
class Ticket {
  Ticket.fromJson(Json j)
      : id = j['id'] as String,
        code = j['code'] as String,
        status = _enum(BookingStatus.values, j['status'] as String),
        holdExpiresAt = _date(j['holdExpiresAt']),
        from = (j['ride'] as Json)['from'] as String,
        to = (j['ride'] as Json)['to'] as String,
        departureAt = DateTime.parse((j['ride'] as Json)['departureAt'] as String),
        arrivalAt = DateTime.parse((j['ride'] as Json)['arrivalAt'] as String),
        rideStatus = _enum(RideStatus.values, (j['ride'] as Json)['status'] as String),
        pickup = Stop.fromJson(j['pickup'] as Json),
        drop = Stop.fromJson(j['drop'] as Json),
        driverName = (j['driver'] as Json?)?['name'] as String?,
        driverPhone = (j['driver'] as Json?)?['phone'] as String?,
        vehicleType = (j['vehicle'] as Json?)?['type'] as String?,
        vehicleNo = (j['vehicle'] as Json?)?['registrationNo'] as String?,
        vehicleName = j['vehicle'] == null
            ? null
            : [(j['vehicle'] as Json)['colour'], (j['vehicle'] as Json)['make'], (j['vehicle'] as Json)['model']].whereType<String>().join(' '),
        passengers = _list(j['passengers'], TicketPassenger.fromJson),
        fare = Fare.fromJson(j['fare'] as Json),
        refunds = _list(j['refunds'], TicketRefund.fromJson),
        supportPhone = (j['support'] as Json)['phone'] as String,
        supportEmail = (j['support'] as Json)['email'] as String;
  final String id, code, from, to, supportPhone, supportEmail;
  final BookingStatus status;
  final RideStatus rideStatus;
  final DateTime? holdExpiresAt;
  final DateTime departureAt, arrivalAt;
  final Stop pickup, drop;
  final String? driverName, driverPhone, vehicleType, vehicleNo, vehicleName;
  final List<TicketPassenger> passengers;
  final Fare fare;
  final List<TicketRefund> refunds;
}

class TicketRefund {
  TicketRefund.fromJson(Json j)
      : amount = j['amount'] as int,
        percent = j['percent'] as int,
        status = j['status'] as String;
  final int amount, percent;

  /// PENDING, PROCESSED or FAILED
  final String status;
}

/// A row in the Bookings tab.
class BookingSummary {
  BookingSummary.fromJson(Json j)
      : id = j['id'] as String,
        code = j['code'] as String,
        status = _enum(BookingStatus.values, j['status'] as String),
        seats = j['seats'] as int,
        total = j['total'] as int,
        from = j['from'] as String,
        to = j['to'] as String,
        departureAt = DateTime.parse(j['departureAt'] as String);
  final String id, code, from, to;
  final BookingStatus status;
  final int seats, total;
  final DateTime departureAt;
}

class CancelPreview {
  CancelPreview.fromJson(Json j)
      : cancellable = j['cancellable'] as bool,
        refundAmount = j['refundAmount'] as int,
        refundPercent = j['refundPercent'] as int,
        tierLabel = j['tierLabel'] as String;
  final bool cancellable;
  final int refundAmount, refundPercent;
  final String tierLabel;
}
