package tcg

import (
	"encoding/json"
	"fmt"

	"github.com/khanmaother/TCG/types"
	"github.com/khanmaother/TCG/utils"
)

func GetCategoriesData(fileName string, fileLocation string) (tcgtypes.CategoriesDataResponse, error) {

	fmt.Println("=== Getting Category Data ===")

	Uri := "https://tcgcsv.com/tcgplayer/categories"

	buffer, err := utils.FetchJson(Uri)
	if err != nil {
		fmt.Println("GetCategory CSVData Error:", err)
		return tcgtypes.CategoriesDataResponse{}, err
	}

	utils.SaveJson(fileName, fileLocation, buffer)

	var categoriesData tcgtypes.CategoriesDataResponse
	err = json.Unmarshal(buffer, &categoriesData)
	if err != nil {
		fmt.Println("GetCategory Unmarshal Error:", err)
		return tcgtypes.CategoriesDataResponse{}, err
	}

	fmt.Printf("=== Found %d Category Data ===\n", len(categoriesData.Results))

	return categoriesData, nil
}

func GetGroupsData(categoryId int, fileName string, fileLocation string) (tcgtypes.GroupsDataResponse, error) {

	fmt.Println("=== Getting Group Data ===")

	Uri := fmt.Sprintf("https://tcgcsv.com/tcgplayer/%d/groups", categoryId)

	buffer, err := utils.FetchJson(Uri)
	if err != nil {
		fmt.Println("GetGroup CSVData Error:", err)
		return tcgtypes.GroupsDataResponse{}, err
	}

	utils.SaveJson(fileName, fileLocation, buffer)

	var groupsData tcgtypes.GroupsDataResponse
	err = json.Unmarshal(buffer, &groupsData)
	if err != nil {
		fmt.Println("GetGroup Unmarshal Error:", err)
		return tcgtypes.GroupsDataResponse{}, err
	}

	fmt.Printf("=== Found %d Group Data ===\n", len(groupsData.Results))

	return groupsData, nil
}

func GetProductsData(categoryId int, groupId int, fileName string, fileLocation string) (tcgtypes.ProductsDataResponse, error) {

	fmt.Println("=== Getting Product Data ===")

	Uri := fmt.Sprintf("https://tcgcsv.com/tcgplayer/%d/%d/products", categoryId, groupId)

	buffer, err := utils.FetchJson(Uri)
	if err != nil {
		fmt.Println("GetProduct CSVData Error:", err)
		return tcgtypes.ProductsDataResponse{}, err
	}

	utils.SaveJson(fileName, fileLocation, buffer)

	var productsData tcgtypes.ProductsDataResponse
	err = json.Unmarshal(buffer, &productsData)
	if err != nil {
		fmt.Println("GetProduct Unmarshal Error:", err)
		return tcgtypes.ProductsDataResponse{}, err
	}

	fmt.Printf("=== Found %d Product Data ===\n", len(productsData.Results))

	return productsData, nil
}

func GetCategoryGroups() error {
	fmt.Println("=== Getting Category Groups ===")

	// Read categories from file
	buffer, err := utils.ReadJson("data/categories/categories.json")
	if err != nil {
		fmt.Println("Error reading categories file:", err)
		return err
	}

	var categoriesData tcgtypes.CategoriesDataResponse
	err = json.Unmarshal(buffer, &categoriesData)
	if err != nil {
		fmt.Println("Error unmarshaling categories:", err)
		return err
	}

	for _, category := range categoriesData.Results {
		fmt.Println("Category:", category.Name)
		groupData, err := GetGroupsData(category.CategoryId, fmt.Sprintf("%d.json", category.CategoryId), "data/groups/")
		if err != nil {
			fmt.Println("Error getting groups:", err)
			continue
		}
		fmt.Printf("Found %d groups for %s\n", len(groupData.Results), category.Name)
	}

	return nil
}

func GetGroupProducts(categoryId int) error {
	fmt.Println("=== Getting Category Groups ===")

	// Read groups from file
	buffer, err := utils.ReadJson(fmt.Sprintf("data/groups/%d.json", categoryId))
	if err != nil {
		fmt.Println("Error reading groups file:", err)
		return err
	}

	var groupsData tcgtypes.GroupsDataResponse
	err = json.Unmarshal(buffer, &groupsData)
	if err != nil {
		fmt.Println("Error unmarshaling groups:", err)
		return err
	}

	for _, group := range groupsData.Results {
		fmt.Println("Group:", group.Name)
		productsData, err := GetProductsData(categoryId, group.GroupId, fmt.Sprintf("%d.json", group.GroupId), "data/products/")
		if err != nil {
			fmt.Println("Error getting products:", err)
			continue
		}
		fmt.Printf("Found %d products for %s\n", len(productsData.Results), group.Name)
	}

	return nil
}