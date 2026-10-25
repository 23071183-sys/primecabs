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
        state = j['state'] as String,
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
        supportEmail = (j['support'] as Json)['email'] as String;
  final int bookingHorizonDays, bookingCutoffMinutes, seatHoldMinutes;
  final String supportPhone, supportEmail;
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
