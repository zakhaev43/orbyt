package util

const (
	USD = "USD"
	EUR = "EUR"
	GBP = "GBP"
	CAD = "CAD"
)

// SupportedCurrencies lists every currency an account can be opened in.
var SupportedCurrencies = []string{USD, EUR, GBP, CAD}

func IsSupportedCurrency(currency string) bool {
	switch currency {
	case USD, EUR, GBP, CAD:
		return true
	}
	return false
}
