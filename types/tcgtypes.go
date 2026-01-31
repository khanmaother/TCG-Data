package  tcgtypes

type CategoriesDataResponse struct {
    TotalItems int        `json:"totalItems"`
    Success    bool       `json:"success"`
    Errors     []string   `json:"errors"`
    Results    []CategoryData `json:"results"`
}

type CategoryData struct {
    CategoryId          int    `json:"categoryId"`
    Name               string `json:"name"`
    ModifiedOn         string `json:"modifiedOn"`
    DisplayName        string `json:"displayName"`
    SeoCategoryName    string `json:"seoCategoryName"`
    CategoryDescription string `json:"categoryDescription"`
    CategoryPageTitle  string `json:"categoryPageTitle"`
    SealedLabel        string `json:"sealedLabel"`
    NonSealedLabel     string `json:"nonSealedLabel"`
    ConditionGuideUrl  string `json:"conditionGuideUrl"`
    IsScannable        bool   `json:"isScannable"`
    Popularity         int    `json:"popularity"`
    IsDirect           bool   `json:"isDirect"`
}

type GroupsDataResponse	 struct{
	TotalItems int        `json:"totalItems"`
	Success    bool       `json:"success"`
	Errors     []string   `json:"errors"`
	Results    []GroupData  `json:"results"`
}

type GroupData struct{
	GroupId          int    `json:"groupId"`
	Name             string `json:"name"`
	Abbreviation     string `json:"abbreviation"`
	IsSupplemental   bool   `json:"isSupplemental"`
	PublishedOn      string `json:"publishedOn"`
	ModifiedOn       string `json:"modifiedOn"`
	CategoryId       int    `json:"categoryId"`
}

type ProductsDataResponse struct{
	TotalItems int        `json:"totalItems"`
	Success    bool       `json:"success"`
	Errors     []string   `json:"errors"`
	Results    []ProductData  `json:"results"`
}

type ProductData struct{
	ProductId    int    `json:"productId"`
	Name         string `json:"name"`
	CleanName    string `json:"cleanName"`
	ImageUrl     string `json:"imageUrl"`
	CategoryId   int    `json:"categoryId"`
	GroupId      int    `json:"groupId"`
	Url          string `json:"url"`
	ModifiedOn   string `json:"modifiedOn"`
	ImageCount   int    `json:"imageCount"`
	PresaleInfo struct {
		IsPresale  bool   `json:"isPresale"`
		ReleasedOn string `json:"releasedOn"`
		Note       string `json:"note"`
	} `json:"presaleInfo"`
    ExtendedData []map[string]interface{} `json:"extendedData"`
}

type PriceDataResponse struct{
	TotalItems int        `json:"totalItems"`
	Success    bool       `json:"success"`
	Errors     []string   `json:"errors"`
	Results    []PriceData  `json:"results"`
}

type PriceData struct{
	ProductId     int     `json:"productId"`
	LowPrice      float64 `json:"lowPrice"`
	MidPrice      float64 `json:"midPrice"`
	HighPrice     float64 `json:"highPrice"`
	MarketPrice   float64 `json:"marketPrice"`
	DirectLowPrice float64 `json:"directLowPrice"`
	SubTypeName   string  `json:"subTypeName"`
	Date          string  `json:"date"`
}